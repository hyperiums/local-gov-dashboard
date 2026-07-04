# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Next.js dev server at http://localhost:3000
npm run build    # Production build
npm start        # Run production server
npm run lint     # Run ESLint
npm test         # Run tests in watch mode
npm run test:run # Run tests once
npm run test:run src/tests/middleware.test.ts  # Run single test file
```

## Architecture

Civic transparency dashboard for Flowery Branch, Georgia. Aggregates local government data from public sources and generates AI summaries.

```
Frontend (Next.js App Router)
    ↓
API Routes (/api/scrape, /api/summarize, /api/data)
    ↓
SQLite Database (data/flowery-branch.db) + Web Scraping (Playwright)
```

### Data Sources
- **CivicClerk Portal**: Meeting agendas, minutes, packets (scraped via Playwright)
- **Municode**: Published ordinances with full text
- **City Website**: Permit reports, financial documents (PDF parsing)

### Key Modules

**`src/lib/scraper/`** - Data extraction modules:
- `civicclerk.ts` - Playwright scraping of meetings with eventIDs
- `municode.ts` - Ordinance scraping and PDF extraction
- `permits.ts` - Monthly permit PDF parsing
- `resolutions.ts` - Extract resolutions from agenda items

**`src/lib/summarize.ts`** - AI summarization:
- Multi-level summaries (headline, brief, detailed, pdf-analysis)
- Cached in `summaries` table to avoid re-processing
- Uses GPT-4o for vision, GPT-4o-mini for text

**`src/lib/db.ts`** - SQLite with better-sqlite3:
- WAL mode for concurrency
- Auto-initializing schema
- Uses `getDb()` singleton pattern

### API Pattern

The `/api/scrape` endpoint orchestrates all data operations:

```typescript
POST /api/scrape
Authorization: Bearer $ADMIN_SECRET
{
  "type": "bulk-meetings-with-agenda",
  "params": { "minYear": 2024, "limit": 10 }
}
```

Key operation types: `discover-meetings`, `bulk-meetings-with-agenda`, `ordinances`, `extract-resolutions`, `generate-meeting-summaries`, `link-ordinances`

### Database Tables
- **meetings** - City council meetings with agenda/minutes URLs
- **agenda_items** - Individual items with reference numbers, outcomes
- **ordinances** - From Municode or auto-created from agenda references
- **resolutions** - Extracted from agenda items
- **ordinance_meetings** - Junction table linking ordinances to meetings
- **summaries** - Cached AI summaries by entity_type/entity_id/summary_type

### ID Conventions
- Meetings: `civicclerk-{eventId}`
- Ordinances: `municode-ord-{number}` or `agenda-ord-{number}`
- Resolutions: `res-{number}`

### Authentication
Middleware protects `/admin`, `/api/scrape`, `/api/summarize`. Uses `ADMIN_SECRET` env var with cookie-based auth for pages, Bearer token for APIs.

## Environment Variables

```bash
OPENAI_API_KEY=sk-...           # Required for AI summarization
ADMIN_SECRET=<random-string>    # Required for protected routes
```

## Testing

This project uses Vitest for testing. Tests live in `src/tests/`.

**When to add tests:**
- Security-critical code (auth, validation, access control)
- Complex logic with edge cases
- Bug fixes (write a failing test first, then fix)
- Code that's difficult to test manually

**Testing philosophy:**
Strategic tests that prevent regressions are more valuable than high coverage numbers. A few well-placed tests on critical paths catch more bugs than exhaustive tests on trivial code.

## Deployment

Production runs via Docker on port 3001 with nginx reverse proxy on `root@45.55.236.77`. Deploy using the local script:
```bash
bash deploy.sh
```
This checkpoints the SQLite WAL, then pushes to the `production` git remote (a bare repo with a post-receive hook that checks out code, rebuilds Docker, and restarts the container). The hook is kept in the repo at `scripts/post-receive.sh` for visibility but is **not** auto-synced — update the server copy manually if it changes.

**Production database is preserved across deploys.** The post-receive hook backs up `data/flowery-branch.db` before checkout and restores it afterward. That means `data:` commits made locally **never reach production** — they only matter as a backup if prod is rebuilt from scratch. The prod DB is kept fresh by the cron pipeline (see below) and ad-hoc admin scrapes. If you want a local data change to deploy, you'd need to skip the hook's restore step.

## Data Refresh Workflow

### Automated (production)

A cron job on the production host runs `/usr/local/bin/flowerybranch-scrape.sh` at **06:00 UTC every Wednesday and Saturday**. The source of truth is `scripts/server-scrape.sh` in this repo — the post-receive hook copies it into place on every deploy.

The cron pipeline runs these operations in order:
1. `bulk-meetings-with-agenda` (minYear 2025) — meetings, agenda items, agenda/minutes summaries, resolutions, vote outcomes, ordinance attachment summaries
2. `ordinances` (no per-call summarization) — pull ordinances published on Municode
3. `generate-ordinance-summaries` (limit 10) — incrementally summarize ordinances still missing a summary
4. `link-ordinances` — attach ordinances to meetings via agenda references
5. `bulk-permits` (current + previous year) — monthly permit PDFs

Failures are emailed via Resend if `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, and `ALERT_TO_EMAIL` are set in `/var/www/flowerybranch.charlesthompson.me/.env` on the server. The script exits non-zero on any non-success response and logs everything to `/var/log/flowerybranch-scrape.log`.

### Manual (local dev)

You can still run any operation against a local `npm run dev` server for testing:
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -d '{"type":"bulk-meetings-with-agenda","params":{"minYear":2026}}'
```

Local DB changes can be committed and deployed, but remember the post-receive hook restores the prod DB after checkout (see Deployment section), so the deployed commit doesn't actually update production data. Commits like `data: ...` are useful as a checked-in backup but won't affect the live site.

### Permits refresh (manual local push)

The production cron's `bulk-permits` step always returns 0 PDFs because the city's PDF CDN (`cms3.revize.com`) blocks our droplet IP. The op exits with `success: true` so it doesn't alert, but it doesn't actually fetch anything from prod. Refresh permits from a machine the CDN isn't blocking (e.g. your laptop):

```bash
# 1. Start the local dev server
npm run dev

# 2. Scrape permits locally
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -d '{"type":"bulk-permits","params":{"years":["2025","2026"]}}'

# 3. Push the rows to prod (uses ssh + the prod ADMIN_SECRET on the server side)
bash scripts/push-permits.sh
```

The `push-permits.sh` script reads from your local DB, scp's a JSON payload to the prod host, and calls `/api/scrape` with `type: import-permits` from inside the host. It never writes the prod `ADMIN_SECRET` to your local shell. Override `PROD_HOST`/`PROD_ENV`/`PROD_API_BASE` env vars to point at a fork or staging environment.

### Business summaries refresh (manual local push)

Business data is AI summaries only (no rows table) and is **not** in the cron — the droplet gets a 403 on the city's `businesslisting` PDFs, same CDN block as permits. When the city posts new monthly listings:

```bash
bash scripts/push-businesses.sh 2026-02 2026-06   # start/end months; defaults to Jan of this year → current month
```

Months without a published PDF are skipped (e.g. Jan 2026 was never posted); re-pushing a month regenerates its summary. The homepage "new businesses" stat regex-parses the summary's closing line `**Total Count**: N new businesses registered this month.`, which `src/lib/prompts/business.ts` pins — don't loosen that wording.

Be respectful when scraping the city site: their permit PDFs are public records under the Georgia Open Records Act, but the bandwidth isn't free. The current `bulk-permits` makes ~24 small requests per refresh and uses an honest `User-Agent` (`FloweryBranchCivicDashboard/1.0 (civic transparency project)`) so the city can see who's hitting them. Don't crank up the frequency or remove the UA.

### Secrets

All credentials live in `/var/www/flowerybranch.charlesthompson.me/.env` on the production host and `.env` locally. Both are gitignored. **Never** commit `.env`, API keys, or admin secrets — this repo is public.

**SQLite WAL note:** Changes live in `flowery-branch.db-wal` until checkpointed. Run `sqlite3 data/flowery-branch.db "PRAGMA wal_checkpoint(TRUNCATE);"` before committing, or git won't see the changes. The deploy script does this automatically.

## Claude Code Skill

Run `/scrape-guide` to get guided assistance with data scraping workflows. This skill knows the proper operation order and verification steps.

## Planning & Documentation

When planning new features or complex changes, use the `docs/` folder to store implementation plans and roadmaps. This folder is gitignored (except its README) to keep the repository clean while allowing local planning.

See `docs/README.md` for guidelines on what belongs there.
