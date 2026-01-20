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

Production runs via Docker on port 3001 with nginx reverse proxy:
```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

Database persists in `./data/` volume mount.

## Claude Code Skill

Run `/scrape-guide` to get guided assistance with data scraping workflows. This skill knows the proper operation order and verification steps.

## Planning & Documentation

When planning new features or complex changes, use the `docs/` folder to store implementation plans and roadmaps. This folder is gitignored (except its README) to keep the repository clean while allowing local planning.

See `docs/README.md` for guidelines on what belongs there.
