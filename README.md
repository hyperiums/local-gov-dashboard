# Civic Dashboard

An open-source civic transparency dashboard that makes local government information accessible and understandable for residents. Aggregates public data from city council meetings, ordinances, permits, and budgets into a single, searchable interface with AI-powered summaries.

Originally built for [Flowery Branch, Georgia](https://flowery-branch.charlesthompson.me), this project can be adapted for any city that uses similar data sources (CivicClerk, Municode, ClearGov).

## Features

- **Meeting Tracker**: Browse past and upcoming city council meetings with agendas, minutes, and vote records
- **Legislation Database**: Search ordinances and resolutions with plain-language AI summaries explaining what each one does
- **Development Activity**: Track building permits and new business registrations
- **Budget Transparency**: Links to ClearGov spending data and budget documents
- **AI Summaries**: Automatically generated plain-language explanations of government documents (using OpenAI)
- **Dark Mode**: Full dark mode support
- **Mobile Friendly**: Responsive design for all screen sizes

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key (for AI summaries)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/civic-dashboard.git
   cd civic-dashboard
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your city by editing `city-config.json` (see [Configuration](#configuration) below)

4. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

5. Add your API keys to `.env`:
   ```
   OPENAI_API_KEY=sk-your-openai-api-key
   ADMIN_SECRET=your-random-admin-secret
   ```

6. Start the development server:
   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000)

## Configuration

The dashboard is configured for your city via `city-config.json` in the project root:

```json
{
  "city": {
    "name": "Your City",
    "state": "Your State",
    "stateAbbrev": "ST",
    "address": "123 Main St, Your City, ST 12345",
    "phone": "555-123-4567",
    "meetingSchedule": "1st & 3rd Tuesdays at 7:00 PM",
    "timezone": "America/New_York"
  },
  "urls": {
    "civicClerk": "https://yourcity.portal.civicclerk.com",
    "cityWebsite": "https://www.yourcity.gov",
    "municode": "https://library.municode.com/st/your_city",
    "municodeProductId": "12345",
    "clearGovBudget": "https://city-your-city-budget-book.cleargov.com/...",
    "clearGovSpending": "https://cleargov.com/state/county/city/your-city"
  },
  "contact": {
    "email": "contact@example.com"
  }
}
```

### Finding Your Municode Product ID

The `municodeProductId` is needed for PDF downloads. You can find it by:
1. Go to your city's Municode page
2. Click on any ordinance to view it
3. Look at the URL - it will contain `nodeId=XXXXX`
4. The product ID is in the download URL pattern

## Data Sources

The dashboard scrapes data from these public sources:

| Source | What It Provides |
|--------|------------------|
| [CivicClerk](https://civicclerk.com) | Meeting agendas, minutes, packets, vote records |
| [Municode](https://municode.com) | Published ordinances with full text |
| [ClearGov](https://cleargov.com) | Budget data and spending transparency |
| City Website | Permit reports, financial documents |

### Populating Data

Data is populated via the admin interface at `/admin`:

1. Log in with your `ADMIN_SECRET`
2. Use the scrape controls to import:
   - Meetings from CivicClerk
   - Ordinances from Municode
   - Generate AI summaries

Or use the API directly:
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"type": "discover-meetings"}'
```

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org) (App Router)
- **Database**: SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Styling**: [Tailwind CSS](https://tailwindcss.com)
- **AI**: [OpenAI GPT-4o](https://openai.com) for document analysis
- **Scraping**: [Playwright](https://playwright.dev) for browser automation

## Platform Compatibility

The scrapers are designed for specific platforms. Your city may use different systems:

| Platform | Used For | Alternatives |
|----------|----------|--------------|
| [CivicClerk](https://civicclerk.com) | Meeting agendas, minutes | Granicus, Legistar, custom CMS |
| [Municode](https://municode.com) | Ordinance library | American Legal, Code Publishing |
| [ClearGov](https://cleargov.com) | Budget visualization | OpenGov, custom finance portals |

If your city uses different platforms, you'll need to adapt the scrapers in `src/lib/scraper/`. The core architecture (database schema, AI summarization, UI) works regardless of data source.

## Project Structure

```
src/
├── app/                  # Next.js App Router pages
│   ├── api/              # API routes (scrape, summarize, data)
│   ├── meetings/         # Meeting pages
│   ├── ordinances/       # Ordinance browser
│   └── ...
├── components/           # React components
├── lib/
│   ├── city-config.ts    # City configuration loader
│   ├── db.ts             # SQLite database
│   ├── scraper/          # Data extraction modules
│   └── summarize.ts      # AI summarization
└── ...
data/
└── flowery-branch.db     # SQLite database (included as example)
```

## Deployment

### Docker (Recommended)

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

The app runs on port 3001 by default. Use nginx or similar as a reverse proxy.

### Vercel

Works out of the box with Vercel, but note that:
- SQLite writes require persistent storage (not available on serverless)
- Consider using a cloud database for production

## Troubleshooting

### Database Issues

**"Database is locked"**: SQLite uses WAL mode for concurrency. If you see lock errors:
1. Stop any running instances of the app
2. Delete the `.db-shm` and `.db-wal` files in `data/`
3. Restart the app

**Database not found**: The database filename is derived from the city name in `city-config.json`. Ensure the name matches your existing database file, or rename the database to match.

### Scraping Issues

**Playwright not working**: Install browsers with `npx playwright install chromium`

**CivicClerk scraping fails**: The portal may have changed. Check if your city's CivicClerk URL is correct in `city-config.json`. Some cities use different portal structures.

**Rate limiting**: Add delays between scrape requests. The admin interface handles this automatically, but direct API calls may hit rate limits.

### Build Issues

**TypeScript errors about city-config.json**: Ensure your `city-config.json` has all required fields including `timezone`.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- Built with data from official public sources
- AI summaries powered by OpenAI
- Inspired by the civic tech community
