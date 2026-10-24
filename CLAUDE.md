# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Next.js dev server at http://localhost:3000
npm run build    # Production build
npm start        # Run the production build locally (the Docker image runs node server.js from .next/standalone)
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

## Independence & attribution

Any deployment of this project is published by someone who is not the government it
covers, while carrying that government's name on every page. The default reading is
therefore that the city publishes it, and the site is built to correct that before a
reader forms the impression. Two files carry everything deployment-specific:

- **`city-config.json` → `operator`** — the name of whoever publishes this, and the one
  disclosure sentence. It renders above the masthead (`DisclosureBar`), in the footer, in
  the page description and OpenGraph/Twitter metadata, and on the link-preview card from
  `src/app/opengraph-image.tsx`. That card is the only one of those that survives a link
  being shared with none of the site around it.
- **`content/about.md`** — the operator's own section of `/about`: who they are, why they
  built it, and any conflict of interest worth disclosing. Rendered by `formatProseHtml`,
  which allows links and headings that machine-written summaries deliberately don't get.

Rules that hold for every deployment, not just this one:

- **Nothing that reads as the government goes above the fold.** No crest, no flag, no city
  wordmark, no initials medallion: a badge of a city's initials reads as a municipal seal.
- **The title never leads with the city as publisher.** Tab titles, search results and
  shared links are all read without the page in front of them, so each one opens on
  "independent."
- **Structural disclosures stay in code; the operator's biography stays in content.**
  `/about` keeps the source-of-truth, automation, and AI-summary sections in the component
  because they are true of every deployment and must not be editable away by mistake.
  Anything about a particular person belongs in `content/about.md`. Adopting this project
  for another city should never mean deleting somebody else's biography from a component.
- **No campaign content, ever.** Where the operator holds or seeks office in the body this
  site covers, `/about` discloses it and nothing else about the campaign appears: no
  fundraising, no sign-up form, no campaign links, no position-taking on an agenda item.
  What makes a dashboard like this worth trusting is that it isn't campaign infrastructure.
- **`src/tests/disclosure.test.ts` asserts the invariants** — the disclosure names the
  operator, denies that the city publishes the site, and stays short enough to read on a
  phone. It is the one string on the site that is load-bearing for honesty rather than for
  content.

### This deployment

Published by Charles Thompson at flowerybranch.charlesthompson.me. He is a candidate for
Flowery Branch City Council, Post 3, in the special election on November 3, 2026, which
`content/about.md` discloses.

"Not a City of Flowery Branch website" gets harder to carry if the person publishing it
joins the council. Should that happen, `operator.disclosure` is the one-line switch and
`content/about.md` is prose that needs a person, not a find-and-replace. Honest wording
for a sitting member still says both things: personally published, and not an official
city communication. What this repo cannot answer is whether an officeholder republishing
city records personally picks up anything under Georgia's open-records or open-meetings
law, or whether the site's running costs want campaign-finance treatment. Those are
city-attorney questions, to be asked before the wording changes rather than settled here.

### Data Sources
- **CivicClerk Portal**: Meeting agendas, minutes, packets. Meetings are discovered from CivicClerk's public Events API (`urls.civicClerkApi` in city-config.json); agenda items, PDFs and votes are scraped via Playwright
- **Municode**: Published ordinances with full text
- **City Website**: Permit reports, financial documents (PDF parsing)

### Key Modules

**`src/lib/scraper/`** - Data extraction modules:
- `civicclerk-events.ts` - Meeting discovery from the CivicClerk Events API (dates are the city's wall-clock time with a Z suffix; the date is the text before the T)
- `civicclerk.ts` - Playwright scraping of agenda items, PDFs, and votes per eventID
- `municode.ts` - Ordinance scraping and PDF extraction
- `permits.ts` - Monthly permit PDF parsing
- `resolutions.ts` - Extract resolutions from agenda items

**`src/lib/summarize.ts`** - AI summarization:
- Multi-level summaries (headline, brief, detailed, pdf-analysis)
- Cached in `summaries` table to avoid re-processing
- Model choice lives in `src/lib/models.ts` (`SUMMARY_MODEL`, `EXTRACTION_MODEL`)
- This model generation rejects `max_tokens` and an explicit `temperature` — use `max_completion_tokens`

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
- **scrape_runs** - One row per collection attempt per feed: outcome, months attempted vs ingested, rows ingested, newest month

### Feed Freshness

`src/lib/feed-status.ts` turns the latest `scrape_runs` row into the banner on
`/development`. Status must come from that table, never from `MAX(permits.month)`:
a feed nobody is collecting and a feed with nothing new to collect leave
identical rows, and only the run log tells them apart. Collection outcomes are
kept distinct for the same reason — `not_published` (city hasn't posted it),
`unreachable` (fetch refused), `not_machine_readable` (scanned image, no text
layer), `parsed_empty` (fetched but unreadable) — because collapsing them into
"not found" is what hid a blocked production scraper for months.

Any new collector should follow the same shape: record a run, report
`success:false` when collection genuinely failed, and never let an empty result
pass as a clean one.

January and February 2023 are the only months the city published as scans with
no text layer. They cannot be parsed and were recovered by OCR plus human
review — see `scripts/scanned-months/`, which keeps the transcriptions as
reviewable data and records their weaker provenance in `scrape_runs`. Treat
them as fixed history: re-running `bulk-permits` reports them as
`not_machine_readable` and leaves them alone.

`AUDIT_PERMITS=1 npx vitest run src/tests/permit-audit.test.ts` re-fetches every
published report and checks the stored rows against the count each one prints.
It is the check that catches a layout the parser silently stopped reading.

Meeting "today" and upcoming/past status follow the city's calendar day (America/New_York) via src/lib/dates.ts, never UTC: a UTC "today" dropped the evening's meeting from 8 pm Eastern (learned 2026-10-15). Status is derived from the date at read time (`withDateStatus` in src/lib/db.ts, `m.date >= ?` in SQL); `meetings.status` is still written by the scraper but nothing reads it, because it lags until the next Wed/Sat scrape and never changes for an event the city deleted (learned 2026-10-15). `src/tests/meeting-status-readers.test.ts` fails if server code filters on it again.

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

# Optional analytics — both must be set at Docker *build* time (they are
# inlined into the client bundle; see Dockerfile ARGs). Unset = no tracking code.
NEXT_PUBLIC_UMAMI_SRC=<umami script url>
NEXT_PUBLIC_UMAMI_WEBSITE_ID=<umami website id>

# Set to 1 where this host cannot fetch the city's permit PDFs — some document
# CDNs answer datacentre IPs with 403 while serving browsers normally, which is
# the case in production. The scheduled scrape then skips the permit step
# instead of failing every run, and permits are pushed in from an unblocked
# machine with scripts/push-permits.sh. Feed status reads collection runs
# either way, so a feed nobody is importing still shows as stale.
PERMITS_VIA_IMPORT=1
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

Production runs via Docker on 127.0.0.1:3001 behind an nginx reverse proxy on `root@45.55.236.77`. The port binds loopback only because Docker's published ports bypass ufw: a bare "3001:3000" was reachable from the internet until 2026-10-23. The cron scrape and the push-*.sh scripts call it from the host, so they are unaffected. Deploy using the local script:
```bash
bash deploy.sh
```
This checkpoints the SQLite WAL, then pushes to the `production` git remote (a bare repo with a post-receive hook that checks out code, rebuilds Docker, and restarts the container). The hook is kept in the repo at `scripts/post-receive.sh` for visibility but is **not** auto-synced — update the server copy manually if it changes.

**The image runs Next's standalone output.** `next.config.ts` sets `output: "standalone"`, and the Dockerfile's runner holds `.next/standalone` (`server.js` plus only the node_modules the build traces as imports), `.next/static`, `public/`, `content/`, and Chromium's headless shell. It starts with `node server.js`, not `npm start`. The builder installs the browser with `node node_modules/playwright/cli.js install chromium-headless-shell` right after `npm ci`, so the revision always matches package-lock.json's playwright-core. Never use `npx` in the runner, because it would fetch the newest Playwright. `npm run build` does not catch a file the trace leaves out: production fails with "Cannot find module" or ENOENT while the build passes. A file loaded through a path the trace cannot see goes in `outputFileTracingIncludes` in `next.config.ts`. After a dependency change, build the image and run `docker exec <container> node -e "require('playwright').chromium.launch().then(b=>b.close())"` inside it. The runner sets `HOSTNAME=0.0.0.0` because Docker sets HOSTNAME to the container id and the standalone server binds to it, which would fail the compose healthcheck. It stays root, for Chromium's cache and the strategic-plan upload into `public/`. `.env` is in `.dockerignore`, so the runtime secrets come from compose's `env_file`; an untracked `.env.production` on the server would still be copied in by the standalone build. On the server the image went from 1.33 GB to 739 MB (amd64, legacy builder, deployed 2026-10-15). The legacy builder leaves the builder stage behind as a dangling image of about 2.1 GB after every deploy; the next deploy's `docker system prune -f` removes it, or `docker rmi` it by ID right after a deploy to get the space back at once (learned 2026-10-15). Since the droplet moved to Ubuntu 26.04, `docker-compose` there is Compose v2 run with `--compatibility`, which builds with BuildKit: a deploy now leaves about 2.2 GB of build cache plus the replaced image (about 760 MB) instead of a builder stage. The next deploy's `docker system prune -f` clears both, or run `docker builder prune -f` and `docker rmi <old image id>` right after a deploy (learned 2026-10-23).

`next.config.ts` keeps `playwright`, `playwright-core`, `css-tree/data` and `mdn-data/css` in `outputFileTracingIncludes` because they load through paths the trace misses (jsdom, which `isomorphic-dompurify` uses, failed to load without the last two; learned 2026-10-15), excludes `data/` because compose bind-mounts it, and drops `libsqlite3` because better-sqlite3 bundles SQLite. The Playwright browser folder (321 MB, headless shell plus ffmpeg) is unchanged by this work, and `outputFileTracingExcludes` cannot remove Next's own `typescript` (about 20 MB).

**Version pins (2026-10-23).** Both Dockerfile stages use the exact tag `node:22.23.4-slim`, not `node:22-slim`. The server hook runs `up -d --build` without `--pull`, so a floating tag could go on building from a cached older base. Bump the tag by hand for each Node security release. Node 20 reached end-of-life without the October 2026 fixes. `eslint-config-next` stays at 16.1.1, with `eslint-plugin-react-hooks` held at 7.0.1 in the lock. Next itself is at 16.4.2. The react-hooks 7.1 rules that 16.4's config brings flag 16 existing effects (`set-state-in-effect` and two others), so moving the config is a change of its own. `npm audit fix` under npm 10.9.x crashes on this lock (arborist, "reading 'edgesOut'"). `npm exec --package=npm@11 -- npm audit fix --package-lock-only` works, and npm 10's `npm ci` accepts the lock it writes.

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

Months without a published PDF are skipped (e.g. Jan 2026 was never posted). The push stores each month's verified PDF URL in the summary metadata, because the city's filenames are inconsistent (`Jun2026businesslisting.pdf` but `June2025…`, and `April2025…` where the permit file is `Apr2025…`) — the `/development` source link uses the stored URL and only guesses from the month as a last resort. By default a re-push just refreshes stored URLs / summarizes new months (no OpenAI spend on existing ones); `FORCE=1 bash scripts/push-businesses.sh …` regenerates summaries too (e.g. after a prompt change). The homepage "new businesses" stat regex-parses the summary's closing line `**Total Count**: N new businesses registered this month.`, which `src/lib/prompts/business.ts` pins — don't loosen that wording.

Be respectful when scraping the city site: their permit PDFs are public records under the Georgia Open Records Act, but the bandwidth isn't free. The current `bulk-permits` makes ~24 small requests per refresh and uses an honest `User-Agent` (`FloweryBranchCivicDashboard/1.0 (civic transparency project)`) so the city can see who's hitting them. Don't crank up the frequency or remove the UA.

### Secrets

All credentials live in `/var/www/flowerybranch.charlesthompson.me/.env` on the production host and `.env` locally. Both are gitignored. **Never** commit `.env`, API keys, or admin secrets — this repo is public.

**The working database is not tracked.** `data/flowery-branch.db` is gitignored;
`data/seed.db` is the committed sample, and `npm run seed` copies it into place.
Tracking the live filename meant every deploy's `git checkout -f` briefly replaced
production's database with the committed snapshot before the hook restored it, and
left the file permanently dirty in git because schema migrations rewrite it. Refresh
the seed deliberately (`sqlite3 prod.db ".backup"` then VACUUM) when the sample data
is worth updating — it is sample data, not a production backup.

**SQLite WAL note:** Changes live in `flowery-branch.db-wal` until checkpointed. Run `sqlite3 data/flowery-branch.db "PRAGMA wal_checkpoint(TRUNCATE);"` before committing, or git won't see the changes. The deploy script does this automatically.

## Claude Code Skill

Run `/scrape-guide` to get guided assistance with data scraping workflows. This skill knows the proper operation order and verification steps.

## Planning & Documentation

When planning new features or complex changes, use the `docs/` folder to store implementation plans and roadmaps. This folder is gitignored (except its README) to keep the repository clean while allowing local planning.

See `docs/README.md` for guidelines on what belongs there.
