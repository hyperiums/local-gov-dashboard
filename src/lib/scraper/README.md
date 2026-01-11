# Scraper Module

This module handles scraping civic data from various sources for the Flowery Branch civic dashboard.

## File Structure

```
scraper/
├── index.ts        # Re-exports all modules
├── utils.ts        # Shared utilities (fetch, month mappings)
├── civicclerk.ts   # CivicClerk portal scraping (meetings, agendas, minutes)
├── resolutions.ts  # Resolution/ordinance extraction and linking
├── permits.ts      # Permit PDF scraping
├── financial.ts    # Financial document scraping
├── civic-docs.ts   # SPLOST, notices, strategic plans, water quality
├── municode.ts     # Municode ordinance scraping
└── business.ts     # Business listing PDF scraping
```

## Data Sources

### CivicClerk Portal (`civicclerk.ts`)
- **URL**: `https://flowerybranchga.portal.civicclerk.com`
- **Data**: City council meetings, planning meetings, work sessions
- **Features**:
  - Scrapes meeting metadata (date, title, type, location)
  - Extracts agenda items from sidebar (newer meetings) or PDF with AI (older meetings)
  - Fetches agenda/minutes PDFs with direct URL extraction from iframe
  - Resolution attachment fetching with S3 fallback for older meetings

### Resolutions (`resolutions.ts`)
- **Function**: Extract and link resolutions/ordinances to meetings
- **Features**:
  - `fetchCivicClerkResolutionAttachments()` - Gets resolution PDFs from sidebar or S3 links
  - `extractResolutionsFromAgendaItems()` - Creates resolution records from agenda items
  - `linkOrdinancesToMeetings()` - Links ordinances to their meeting discussions

### Municode (`municode.ts`)
- **URL**: `https://library.municode.com/ga/flowery_branch/ordinances`
- **Data**: Official ordinance text and PDFs
- **Features**:
  - Scrapes ordinance listings by year
  - Generates direct PDF download URLs

### Financial Documents (`financial.ts`)
- **URL**: `https://www.flowerybranchga.org/departments/finance/financial_reports.php`
- **Types**: Budget, Audit (CAFR), PAFR, Five Year Digest

### Civic Documents (`civic-docs.ts`)
- **Types**: SPLOST reports, public notices, strategic plans, water quality reports
- **Features**: Scrapes PDFs from respective city website pages

### Permits (`permits.ts`)
- **Data**: Monthly permit listing PDFs
- **Features**: Multiple URL format fallbacks for different years

### Business Listings (`business.ts`)
- **Data**: Monthly new business registration PDFs

## Key Patterns

### Browser-Based Scraping
CivicClerk and Municode are React SPAs that require Playwright for rendering:
```typescript
const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
// ... scrape rendered content
await browser.close();
```

### PDF Extraction from iframes
CivicClerk embeds PDFs in pdfjs viewer iframes. The actual PDF URL is in the `file` query param:
```typescript
const src = iframe.getAttribute('src'); // .../viewer.html?file=https%3A%2F%2F...
const pdfUrl = decodeURIComponent(src.match(/file=([^&]+)/)[1]);
```

### S3 Fallback for Older Meetings
Older meetings (pre-Sept 2025) don't have structured sidebar data. Resolution PDFs are linked within the agenda viewer iframe as Legistar S3 URLs:
```
https://legistarweb-production.s3.amazonaws.com/uploads/attachment/pdf/XXXXX/Resolution_XX-XXX.pdf
```

### AI-Powered Extraction
When sidebar parsing fails, agenda items can be extracted from PDFs using OpenAI:
```typescript
const pdfBase64 = await fetchCivicClerkAgendaPdf(eventId);
const items = await extractAgendaItemsFromPdf(pdfBase64);
```

## Usage

Import from the module root:
```typescript
import {
  scrapeCivicClerkMeetingDetails,
  fetchCivicClerkResolutionAttachments,
  scrapeFinancialReports,
} from '@/lib/scraper';
```

Or import specific modules:
```typescript
import { scrapeCivicClerkMeetingDetails } from '@/lib/scraper/civicclerk';
```
