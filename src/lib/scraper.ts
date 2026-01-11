// Scraping utilities for Flowery Branch civic data
import { DATA_SOURCES } from './types';
import {
  getAgendaItemsWithOrdinances,
  getOrdinanceByNumber,
  insertOrdinanceMeeting,
  insertResolution,
  getDb,
} from './db';

// Month name mappings for URL construction
const MONTH_NAMES: Record<string, string> = {
  '01': 'Jan',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Apr',
  '05': 'May',
  '06': 'June',
  '07': 'July',
  '08': 'Aug',
  '09': 'Sept',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dec',
};

// Alternative month names (some PDFs use different formats)
// Include common abbreviations and full names for each month
const ALT_MONTH_NAMES: Record<string, string[]> = {
  '01': ['Jan', 'January'],
  '02': ['Feb', 'February'],
  '03': ['Mar', 'March'],
  '04': ['Apr', 'April'],
  '05': ['May'],
  '06': ['June', 'Jun'],
  '07': ['July', 'Jul'],
  '08': ['Aug', 'August'],
  '09': ['Sept', 'Sep', 'September'],
  '10': ['Oct', 'October'],
  '11': ['Nov', 'November'],
  '12': ['Dec', 'December'],
};

export interface ScrapedMeeting {
  id: string;
  date: string;
  title: string;
  type: string;
  location: string;
  civicClerkEventId?: number;
  agendaUrl?: string;
  minutesUrl?: string;
  packetUrl?: string;
}

export interface ScrapedAgendaItem {
  orderNum: number;
  title: string;
  type: string;
  referenceNumber?: string;
  attachments: { name: string; url: string }[];
}

// Fetch HTML from a URL
async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'FloweryBranchCivicDashboard/1.0 (civic transparency project)',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

// Fetch PDF and return buffer
export async function fetchPdf(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'FloweryBranchCivicDashboard/1.0 (civic transparency project)',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Parse CivicClerk portal for meetings list
export async function scrapeCivicClerkMeetings(): Promise<ScrapedMeeting[]> {
  // CivicClerk is a React app, so we need to parse the rendered HTML
  // For now, we'll use known event IDs and check which ones exist
  const meetings: ScrapedMeeting[] = [];

  // Try event IDs 1-50 to find valid meetings
  for (let eventId = 1; eventId <= 50; eventId++) {
    try {
      const url = `${DATA_SOURCES.civicClerk.baseUrl}/event/${eventId}/files`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'FloweryBranchCivicDashboard/1.0',
        },
      });

      if (response.ok) {
        const html = await response.text();

        // Extract meeting info from HTML
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        const dateMatch = html.match(/(\w+day),?\s+(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);

        if (titleMatch && dateMatch) {
          const [, , month, day, year] = dateMatch;
          const monthNum = getMonthNumber(month);
          const dateStr = `${year}-${monthNum}-${day.padStart(2, '0')}`;

          meetings.push({
            id: `civicclerk-${eventId}`,
            date: dateStr,
            title: titleMatch[1].replace(' - Flowery Branch', '').trim(),
            type: titleMatch[1].toLowerCase().includes('council') ? 'city_council' : 'other',
            location: '5410 Pine Street, Flowery Branch, GA 30542',
            civicClerkEventId: eventId,
            agendaUrl: `${url}#agenda`,
            packetUrl: url,
          });
        }
      }
    } catch {
      // Event doesn't exist, continue
    }
  }

  return meetings;
}

function getMonthNumber(monthName: string): string {
  const months: Record<string, string> = {
    january: '01', jan: '01',
    february: '02', feb: '02',
    march: '03', mar: '03',
    april: '04', apr: '04',
    may: '05',
    june: '06', jun: '06',
    july: '07', jul: '07',
    august: '08', aug: '08',
    september: '09', sep: '09', sept: '09',
    october: '10', oct: '10',
    november: '11', nov: '11',
    december: '12', dec: '12',
  };
  return months[monthName.toLowerCase()] || '01';
}

// Scrape a specific CivicClerk meeting for agenda items using Playwright
// CivicClerk is a React SPA, so we need to render the page with a browser
export async function scrapeCivicClerkMeetingDetails(eventId: number): Promise<{
  meeting: ScrapedMeeting | null;
  agendaItems: ScrapedAgendaItem[];
}> {
  const url = `${DATA_SOURCES.civicClerk.baseUrl}/event/${eventId}/files`;
  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    console.log(`Navigating to CivicClerk event ${eventId}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Get the rendered page content
    const bodyText = await page.evaluate(() => document.body.innerText);
    const pageTitle = await page.title();

    // Check if meeting has published files
    if (bodyText.includes('No published Meeting Files')) {
      console.log(`Event ${eventId}: No published files yet`);
      // Still try to extract meeting metadata
      const dateMatch = bodyText.match(/([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
      if (dateMatch) {
        const monthNum = getMonthNumber(dateMatch[1]);
        const dateStr = `${dateMatch[3]}-${monthNum}-${dateMatch[2].padStart(2, '0')}`;
        return {
          meeting: {
            id: `civicclerk-${eventId}`,
            date: dateStr,
            title: pageTitle.includes('Council') ? 'City Council Meeting' : 'City Meeting',
            type: 'city_council',
            location: '5410 Pine Street, Flowery Branch, GA 30542',
            civicClerkEventId: eventId,
            agendaUrl: url,
            packetUrl: url,
          },
          agendaItems: [],
        };
      }
      return { meeting: null, agendaItems: [] };
    }

    // Parse meeting date from page content
    // Format: "City Council Meeting - January 07, 2026"
    const dateMatch = bodyText.match(/([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    let meeting: ScrapedMeeting | null = null;

    if (dateMatch) {
      const monthNum = getMonthNumber(dateMatch[1]);
      const dateStr = `${dateMatch[3]}-${monthNum}-${dateMatch[2].padStart(2, '0')}`;

      // Determine meeting type
      const titleLower = pageTitle.toLowerCase();
      let type = 'city_council';
      let title = 'City Council Meeting';
      if (titleLower.includes('planning')) {
        type = 'planning';
        title = 'Planning Commission Meeting';
      } else if (titleLower.includes('work session')) {
        type = 'work_session';
        title = 'Work Session';
      }

      meeting = {
        id: `civicclerk-${eventId}`,
        date: dateStr,
        title,
        type,
        location: '5410 Pine Street, Flowery Branch, GA 30542',
        civicClerkEventId: eventId,
        agendaUrl: url,
        packetUrl: url,
      };
    }

    // Parse agenda items from rendered content
    const agendaItems: ScrapedAgendaItem[] = [];
    const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);
    let orderNum = 0;

    // Track seen items to avoid duplicates
    const seenItems = new Set<string>();

    for (const line of lines) {
      // Match lines starting with lowercase letter + dot + space
      const itemMatch = line.match(/^([a-z])\.\s+(.+)/i);
      if (!itemMatch) continue;

      const title = itemMatch[2].trim();

      // Skip duplicates and non-substantive items
      const titleKey = title.toLowerCase();
      if (seenItems.has(titleKey)) continue;
      if (title === 'No Attachment File') continue;
      if (title.length < 10) continue; // Skip very short items

      seenItems.add(titleKey);
      orderNum++;

      // Detect type from title
      let type = 'other';
      let referenceNumber: string | undefined;

      if (title.toLowerCase().includes('ordinance')) {
        type = 'ordinance';
        // Match "Ordinance 773" or "Ordinance No. 773"
        const ordMatch = title.match(/Ordinance(?:\s+No\.?)?\s+(\d+)/i);
        if (ordMatch) referenceNumber = ordMatch[1];
      } else if (title.toLowerCase().includes('resolution')) {
        type = 'resolution';
        const resMatch = title.match(/Resolution\s+([\d-]+)/i);
        if (resMatch) referenceNumber = resMatch[1];
      } else if (title.toLowerCase().includes('public hearing')) {
        type = 'public_hearing';
      } else if (title.toLowerCase().includes('consider')) {
        type = 'new_business';
      } else if (title.toLowerCase().includes('report')) {
        type = 'report';
      } else if (title.toLowerCase().includes('minutes')) {
        type = 'consent';
      }

      agendaItems.push({
        orderNum,
        title,
        type,
        referenceNumber,
        attachments: [],
      });
    }

    console.log(`Event ${eventId}: Found ${agendaItems.length} agenda items`);
    return { meeting, agendaItems };

  } catch (error) {
    console.error(`Failed to scrape meeting ${eventId}:`, error);
    return { meeting: null, agendaItems: [] };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Get permit PDF URL for a given month
export function getPermitPdfUrl(year: string, month: string): string[] {
  const monthName = MONTH_NAMES[month];
  const altNames = ALT_MONTH_NAMES[month] || [];
  const monthLower = monthName.toLowerCase();
  const basePath = 'https://www.flowerybranchga.org/Documents/Departments/Community%20Development/Monthly%20Permit%20Statistics';

  // Build comprehensive list of URL variations
  const urls: string[] = [];

  // Root level - "permitlisting" format (2024+)
  urls.push(`https://www.flowerybranchga.org/${monthName}${year}permitlisting.pdf`);
  altNames.forEach(name => urls.push(`https://www.flowerybranchga.org/${name}${year}permitlisting.pdf`));

  // Root level - "permit" format (2020 and some others)
  urls.push(`https://www.flowerybranchga.org/${monthName}${year}permit.pdf`);
  altNames.forEach(name => urls.push(`https://www.flowerybranchga.org/${name}${year}permit.pdf`));

  // Documents folder - "permitlisting" format (2023)
  urls.push(`${basePath}/${year}/${monthLower}${year}permitlisting.pdf`);
  altNames.forEach(name => urls.push(`${basePath}/${year}/${name.toLowerCase()}${year}permitlisting.pdf`));

  // Documents folder - "permit_listing" format (some 2023)
  urls.push(`${basePath}/${year}/${monthLower}${year}permit_listing.pdf`);

  // Documents folder - "permit" format (2022 and earlier)
  urls.push(`${basePath}/${year}/${monthLower}${year}permit.pdf`);
  altNames.forEach(name => urls.push(`${basePath}/${year}/${name.toLowerCase()}${year}permit.pdf`));

  return urls;
}

// Get business listing PDF URL for a given month
export function getBusinessPdfUrl(year: string, month: string): string[] {
  const monthName = MONTH_NAMES[month];
  const altNames = ALT_MONTH_NAMES[month] || [];

  const urls = [
    `https://www.flowerybranchga.org/${monthName}${year}businesslisting.pdf`,
    ...altNames.map(name => `https://www.flowerybranchga.org/${name}${year}businesslisting.pdf`),
  ];

  return urls;
}

// Try multiple URLs until one works
export async function fetchPdfWithFallback(urls: string[]): Promise<{ buffer: Buffer; url: string } | null> {
  for (const url of urls) {
    try {
      const buffer = await fetchPdf(url);
      return { buffer, url };
    } catch {
      // Try next URL
    }
  }
  return null;
}

// Financial document types
export type FinancialDocType = 'budget' | 'audit' | 'pafr' | 'digest' | 'other';

export interface FinancialDocument {
  fiscalYear: string;
  type: FinancialDocType;
  title: string;
  url: string;
}

// Scrape the city website for financial report links
// Source: https://www.flowerybranchga.org/departments/finance/financial_reports.php
export async function scrapeFinancialReports(): Promise<FinancialDocument[]> {
  const reports: FinancialDocument[] = [];

  try {
    const html = await fetchHtml(DATA_SOURCES.cityWebsite.financialReports);

    // Find all PDF links on the page
    const linkMatches = html.matchAll(
      /href="([^"]*\.pdf[^"]*)"/gi
    );

    for (const match of linkMatches) {
      let url = match[1];

      // Skip non-financial PDFs
      const lowerUrl = url.toLowerCase();
      if (!lowerUrl.includes('finance') &&
          !lowerUrl.includes('budget') &&
          !lowerUrl.includes('audit') &&
          !lowerUrl.includes('financial') &&
          !lowerUrl.includes('pafr') &&
          !lowerUrl.includes('cafr') &&
          !lowerUrl.includes('digest')) {
        continue;
      }

      if (!url.startsWith('http')) {
        // Ensure path starts with /
        const path = url.startsWith('/') ? url : `/${url}`;
        url = `https://www.flowerybranchga.org${path}`;
      }

      // Clean up URL (remove query params like ?t=timestamp)
      const cleanUrl = url.split('?')[0];

      // Extract fiscal year from URL or filename
      const yearMatch = url.match(/(?:FY\s*)?(\d{4})/i);
      const fiscalYear = yearMatch ? `FY${yearMatch[1]}` : 'Unknown';

      // Get just the filename for categorization (avoid matching on folder names like "Audits & Budgets")
      const filename = cleanUrl.split('/').pop()?.toLowerCase() || lowerUrl;

      // Determine document type based on FILENAME patterns (not full URL path)
      // Order matters! Check more specific patterns first
      let type: FinancialDocType = 'other';
      let title = '';

      if (filename.includes('pafr') || filename.includes('popular')) {
        type = 'pafr';
        title = `${fiscalYear} Popular Annual Financial Report`;
      } else if (filename.includes('digest') || filename.includes('five_year') || filename.includes('five year') || filename.includes('five%20year')) {
        type = 'digest';
        title = `${fiscalYear} Five Year Digest History`;
      } else if (filename.includes('budget')) {
        // Check for budget BEFORE audit because folder path contains "Audits"
        type = 'budget';
        title = `${fiscalYear} Annual Operating & Capital Budget`;
      } else if (filename.includes('comprehensive') ||
                 filename.includes('cafr') ||
                 filename.includes('audit') ||
                 filename.includes('comp-fin') ||
                 (filename.includes('annual') && filename.includes('financial'))) {
        type = 'audit';
        title = `${fiscalYear} Annual Comprehensive Financial Report`;
      }

      // Skip if we couldn't categorize or if it's a duplicate
      if (type === 'other' || fiscalYear === 'Unknown') continue;

      // Check for duplicates (same fiscal year and type)
      const isDuplicate = reports.some(r => r.fiscalYear === fiscalYear && r.type === type);
      if (isDuplicate) continue;

      reports.push({ fiscalYear, type, title, url: cleanUrl });
    }

    // Sort by fiscal year descending
    reports.sort((a, b) => {
      const yearA = parseInt(a.fiscalYear.replace('FY', ''));
      const yearB = parseInt(b.fiscalYear.replace('FY', ''));
      return yearB - yearA;
    });

  } catch (error) {
    console.error('Failed to scrape financial reports:', error);
  }

  return reports;
}

// Get financial documents by type
export async function getFinancialDocumentsByType(type: FinancialDocType): Promise<FinancialDocument[]> {
  const allDocs = await scrapeFinancialReports();
  return allDocs.filter(doc => doc.type === type);
}

// Civic document types for the Documents page
export type CivicDocType = 'splost' | 'notice' | 'strategic' | 'water-quality';

export interface CivicDocument {
  id: string;           // Generated from URL hash
  type: CivicDocType;
  title: string;
  url: string;
  date?: string;        // Extracted from filename/title if possible
}

// Scrape civic documents from various city website pages
// Each page type has PDF links that we discover dynamically
export async function scrapeCivicDocuments(docType?: CivicDocType): Promise<CivicDocument[]> {
  const documents: CivicDocument[] = [];

  // Define source URLs for each document type
  const sources: Record<CivicDocType, string> = {
    'splost': DATA_SOURCES.cityWebsite.splostReports,
    'notice': DATA_SOURCES.cityWebsite.publicNotices,
    'strategic': DATA_SOURCES.cityWebsite.strategicPlan,
    'water-quality': DATA_SOURCES.cityWebsite.waterQualityReports,
  };

  // If a specific type is requested, only scrape that type
  const typesToScrape: CivicDocType[] = docType
    ? [docType]
    : ['splost', 'notice', 'strategic', 'water-quality'];

  for (const type of typesToScrape) {
    try {
      const html = await fetchHtml(sources[type]);

      // Find all PDF links on the page
      const linkMatches = html.matchAll(
        /href="([^"]*\.pdf[^"]*)"/gi
      );

      for (const match of linkMatches) {
        let url = match[1];

        // Skip common non-relevant PDFs that appear in navigation
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes('garage_sale') ||
            lowerUrl.includes('election_results') ||
            lowerUrl.includes('social_media') ||
            lowerUrl.includes('employee_benefits') ||
            lowerUrl.includes('court_calendar')) {
          continue;
        }

        // Filter by document type to avoid cross-contamination
        if (type === 'splost' && !lowerUrl.includes('splost')) continue;
        if (type === 'notice' && !lowerUrl.includes('notice') && !lowerUrl.includes('press')) continue;
        if (type === 'strategic' && !lowerUrl.includes('strategic')) continue;
        if (type === 'water-quality') {
          // Exclude known non-reports (placeholder files, guides, etc.)
          if (lowerUrl.includes('lorem') ||
              lowerUrl.includes('landscape') ||
              lowerUrl.includes('guide')) continue;
          // Must be an actual water quality report or CCR
          if (!lowerUrl.includes('ccr') &&
              !lowerUrl.includes('water_quality') &&
              !lowerUrl.includes('water-quality') &&
              !lowerUrl.includes('quality_report')) continue;
        }

        if (!url.startsWith('http')) {
          const path = url.startsWith('/') ? url : `/${url}`;
          url = `https://www.flowerybranchga.org${path}`;
        }

        // Clean up URL (remove query params like ?t=timestamp)
        const cleanUrl = url.split('?')[0];

        // Generate a stable ID from the URL
        const id = cleanUrl.split('/').pop()?.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9]/g, '-') || `doc-${Date.now()}`;

        // Extract title from filename
        const filename = cleanUrl.split('/').pop() || '';
        const title = filename
          .replace(/\.pdf$/i, '')
          .replace(/%20/g, ' ')
          .replace(/[-_]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // Try to extract date/year from filename
        const yearMatch = filename.match(/(?:FY)?(\d{4})/i);
        const dateMatch = filename.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        let date: string | undefined;
        if (dateMatch) {
          date = `${dateMatch[3]}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`;
        } else if (yearMatch) {
          date = yearMatch[1];
        }

        // Check for duplicates
        const isDuplicate = documents.some(d => d.url === cleanUrl);
        if (isDuplicate) continue;

        documents.push({
          id,
          type,
          title,
          url: cleanUrl,
          date,
        });
      }
    } catch (error) {
      console.error(`Failed to scrape ${type} documents:`, error);
    }
  }

  // Sort by date descending (most recent first)
  documents.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  return documents;
}

// Get civic documents by type
export async function getCivicDocumentsByType(type: CivicDocType): Promise<CivicDocument[]> {
  return scrapeCivicDocuments(type);
}

// Parse PDF text to extract permit data
export function parsePermitPdfText(text: string, month: string, sourceUrl: string): {
  id: string;
  month: string;
  type: string;
  address: string;
  description: string;
  value?: number;
  sourceUrl: string;
}[] {
  const permits: ReturnType<typeof parsePermitPdfText> = [];

  // Split by lines and look for permit entries
  const lines = text.split('\n').filter(line => line.trim());

  let currentPermit: Partial<(typeof permits)[0]> | null = null;

  for (const line of lines) {
    // Look for address patterns (common in permit listings)
    const addressMatch = line.match(/(\d+\s+[A-Za-z\s]+(?:Street|St|Road|Rd|Drive|Dr|Avenue|Ave|Lane|Ln|Way|Circle|Cir|Court|Ct))/i);

    // Look for permit type patterns
    const typeMatch = line.match(/(Residential|Commercial|New Construction|Renovation|Addition|Electrical|Plumbing|HVAC|Mechanical)/i);

    // Look for value patterns
    const valueMatch = line.match(/\$?([\d,]+(?:\.\d{2})?)/);

    if (addressMatch) {
      // Save previous permit if exists
      if (currentPermit?.address) {
        permits.push({
          id: `permit-${month}-${permits.length}`,
          month,
          type: currentPermit.type || 'other',
          address: currentPermit.address,
          description: currentPermit.description || '',
          value: currentPermit.value,
          sourceUrl,
        });
      }

      // Start new permit
      currentPermit = {
        address: addressMatch[1].trim(),
      };
    }

    if (currentPermit) {
      if (typeMatch && !currentPermit.type) {
        currentPermit.type = typeMatch[1].toLowerCase();
      }
      if (valueMatch && !currentPermit.value) {
        const value = parseFloat(valueMatch[1].replace(/,/g, ''));
        if (!isNaN(value) && value > 100) {
          currentPermit.value = value;
        }
      }
    }
  }

  // Don't forget the last permit
  if (currentPermit?.address) {
    permits.push({
      id: `permit-${month}-${permits.length}`,
      month,
      type: currentPermit.type || 'other',
      address: currentPermit.address,
      description: currentPermit.description || '',
      value: currentPermit.value,
      sourceUrl,
    });
  }

  return permits;
}

// Scrape Municode ordinances using Playwright (headless browser)
// This approach works reliably because Municode is a React SPA with authenticated APIs
export interface ScrapedOrdinance {
  number: string;
  year: string;
  title: string;
  municodeUrl: string;
  nodeId: string;
  pdfUrl: string; // Direct PDF download URL
}

// Municode PDF URL pattern - productId 14328 is Flowery Branch
const MUNICODE_PRODUCT_ID = '14328';
export function getMunicodePdfUrl(nodeId: string): string {
  return `https://mcclibraryfunctions.azurewebsites.us/api/ordinanceDownload/${MUNICODE_PRODUCT_ID}/${nodeId}/pdf`;
}

export async function scrapeMunicodeOrdinances(years?: string[]): Promise<ScrapedOrdinance[]> {
  const ordinances: ScrapedOrdinance[] = [];
  const baseUrl = 'https://library.municode.com/ga/flowery_branch/ordinances/code_of_ordinances';

  // Dynamic import of playwright to avoid issues with Next.js bundling
  const { chromium } = await import('playwright');

  let browser;
  try {
    // Launch headless browser
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    console.log('Navigating to Municode...');

    // Navigate to Municode ordinances page
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for content to load - look for the main content area
    await page.waitForTimeout(3000); // Give React time to render

    // Get page title to verify we're on the right page
    const title = await page.title();
    console.log('Page title:', title);

    // Find all clickable year items in the sidebar
    // Municode uses a tree structure with expandable items
    const yearButtons = await page.$$('button, [role="button"], [class*="toggle"], span');
    console.log(`Found ${yearButtons.length} potential clickable elements`);

    // Look for year text in the page
    const pageContent = await page.content();
    const yearMatches = pageContent.match(/>(20\d{2})</g);
    const foundYears = yearMatches ? [...new Set(yearMatches.map(m => m.slice(1, 5)))] : [];
    console.log('Years found in page:', foundYears);

    // Determine which years to process
    const targetYears = years || foundYears.filter(y => parseInt(y) >= 2020);
    console.log('Target years:', targetYears);

    // Process each target year
    for (const year of targetYears) {
      try {
        console.log(`Processing year ${year}...`);

        // Try to click on the year to expand it
        const yearSelector = `text="${year}"`;
        const yearElement = await page.$(yearSelector);

        if (yearElement) {
          await yearElement.click();
          await page.waitForTimeout(1000); // Wait for expansion

          // Now look for ordinance links
          const ordLinks = await page.$$eval('a', (links) => {
            return links
              .filter(link => {
                const text = link.textContent || '';
                const href = link.getAttribute('href') || '';
                return text.includes('Ordinance No.') && href.includes('nodeId');
              })
              .map(link => ({
                text: link.textContent?.trim() || '',
                href: link.getAttribute('href') || '',
              }));
          });

          console.log(`Found ${ordLinks.length} ordinance links for year ${year}`);

          for (const link of ordLinks) {
            const ordMatch = link.text.match(/Ordinance No\.\s*(\d+[-A-Za-z]*)/i);
            const nodeIdMatch = link.href.match(/nodeId=(\d+)/);

            if (ordMatch && nodeIdMatch) {
              const nodeId = nodeIdMatch[1];
              // Clean up the title - remove extra whitespace and meeting text
              const cleanTitle = `Ordinance No. ${ordMatch[1]}`;
              // Avoid duplicates
              if (!ordinances.some(o => o.nodeId === nodeId)) {
                ordinances.push({
                  number: ordMatch[1],
                  year,
                  title: cleanTitle,
                  municodeUrl: link.href.startsWith('http') ? link.href : `${baseUrl}?nodeId=${nodeId}`,
                  nodeId,
                  pdfUrl: getMunicodePdfUrl(nodeId),
                });
              }
            }
          }
        } else {
          console.log(`Could not find year element for ${year}`);
        }
      } catch (error) {
        console.error(`Failed to process year ${year}:`, error);
      }
    }

    // Sort by year (desc) and number (desc)
    ordinances.sort((a, b) => {
      if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year);
      return parseInt(b.number) - parseInt(a.number);
    });

    console.log(`Total ordinances found: ${ordinances.length}`);

  } catch (error) {
    console.error('Failed to scrape Municode ordinances:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return ordinances;
}

// Dynamically discover valid CivicClerk event IDs using Playwright
// CivicClerk is a React SPA, so we need to scrape the rendered page
export async function discoverCivicClerkEventIds(): Promise<number[]> {
  const validIds: number[] = [];
  const baseUrl = DATA_SOURCES.civicClerk.baseUrl;

  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    console.log('Navigating to CivicClerk portal...');
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Scroll up to load past events
    console.log('Loading past events...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
    }

    // Scroll down to load future events
    console.log('Loading future events...');
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
    }

    // Extract all event IDs from links
    const eventLinks = await page.$$eval('a[href*="/event/"]', (links) => {
      return links
        .map(link => {
          const href = (link as HTMLAnchorElement).href;
          const match = href.match(/\/event\/(\d+)/);
          return match ? parseInt(match[1]) : null;
        })
        .filter((id): id is number => id !== null);
    });

    // Get unique IDs
    const uniqueIds = [...new Set(eventLinks)];
    validIds.push(...uniqueIds);

    console.log(`Found ${validIds.length} unique event IDs`);

  } catch (error) {
    console.error('Failed to discover CivicClerk events:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return validIds.sort((a, b) => a - b);
}

// Scrape all meetings from CivicClerk portal using Playwright
export interface CivicClerkMeeting {
  eventId: number;
  date: string;
  title: string;
  location: string;
  type: string;
  agendaUrl: string;
  minutesUrl?: string;
  mediaUrl?: string;
  agendaText?: string;
}

// Get the direct PDF URL for a CivicClerk event's agenda
// This requires visiting the page and extracting the file ID from the iframe
export async function getCivicClerkAgendaPdfUrl(eventId: number): Promise<string | null> {
  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    const eventUrl = `${DATA_SOURCES.civicClerk.baseUrl}/event/${eventId}/files`;
    console.log(`Navigating to ${eventUrl}...`);
    await page.goto(eventUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000); // Give more time for iframe to load

    // Extract the PDF URL from the iframe src
    const pdfUrl = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="pdfjs"]');
      if (!iframe) {
        // Debug: log what iframes we can find
        const allIframes = document.querySelectorAll('iframe');
        console.log('No pdfjs iframe found. Total iframes:', allIframes.length);
        allIframes.forEach((f, i) => console.log(`iframe ${i}:`, f.src?.substring(0, 100)));
        return null;
      }

      const src = iframe.getAttribute('src') || '';
      // Extract the file URL from the iframe src
      // Format: .../viewer.html?file=https%3A%2F%2F...GetMeetingFileStream(fileId%3D2545...)
      const fileMatch = src.match(/file=([^&]+)/);
      if (!fileMatch) {
        console.log('No file param found in iframe src:', src.substring(0, 200));
        return null;
      }

      return decodeURIComponent(fileMatch[1]);
    });

    console.log(`PDF URL for event ${eventId}:`, pdfUrl ? pdfUrl.substring(0, 100) + '...' : 'NOT FOUND');
    return pdfUrl;
  } catch (error) {
    console.error(`Failed to get agenda PDF URL for event ${eventId}:`, error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Fetch the agenda PDF for a meeting and return as base64
export async function fetchCivicClerkAgendaPdf(eventId: number): Promise<string | null> {
  const pdfUrl = await getCivicClerkAgendaPdfUrl(eventId);
  if (!pdfUrl) return null;

  try {
    const response = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'FloweryBranchCivicDashboard/1.0 (civic transparency project)',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch agenda PDF: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  } catch (error) {
    console.error('Error fetching agenda PDF:', error);
    return null;
  }
}

// Get the direct PDF URL for a CivicClerk event's minutes
// Minutes are only available for past meetings after they've been approved
export async function getCivicClerkMinutesPdfUrl(eventId: number): Promise<string | null> {
  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    const eventUrl = `${DATA_SOURCES.civicClerk.baseUrl}/event/${eventId}/files`;
    console.log(`Navigating to ${eventUrl} for minutes...`);
    await page.goto(eventUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check if Minutes exists in the file list
    const hasMinutes = await page.evaluate(() => {
      const items = document.querySelectorAll('li.MuiListItem-container');
      for (const item of items) {
        const textSpan = item.querySelector('.MuiListItemText-primary');
        if (textSpan?.textContent?.trim() === 'Minutes') {
          return true;
        }
      }
      return false;
    });

    if (!hasMinutes) {
      console.log(`No minutes found for event ${eventId}`);
      return null;
    }

    // Click on Minutes to load it in the viewer
    await page.evaluate(() => {
      const items = document.querySelectorAll('li.MuiListItem-container button');
      for (const btn of items) {
        if (btn.textContent?.includes('Minutes') && !btn.getAttribute('title')) {
          (btn as HTMLElement).click();
          return;
        }
      }
    });

    // Wait for the PDF to load in the iframe
    await page.waitForTimeout(2000);

    // Extract the PDF URL from the iframe src
    const pdfUrl = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="pdfjs"]');
      if (!iframe) return null;

      const src = iframe.getAttribute('src') || '';
      const fileMatch = src.match(/file=([^&]+)/);
      if (!fileMatch) return null;

      return decodeURIComponent(fileMatch[1]);
    });

    console.log(`Minutes PDF URL for event ${eventId}:`, pdfUrl ? pdfUrl.substring(0, 100) + '...' : 'NOT FOUND');
    return pdfUrl;
  } catch (error) {
    console.error(`Failed to get minutes PDF URL for event ${eventId}:`, error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Fetch the minutes PDF for a meeting and return as base64
export async function fetchCivicClerkMinutesPdf(eventId: number): Promise<string | null> {
  const pdfUrl = await getCivicClerkMinutesPdfUrl(eventId);
  if (!pdfUrl) return null;

  try {
    const response = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'FloweryBranchCivicDashboard/1.0 (civic transparency project)',
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch minutes PDF: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  } catch (error) {
    console.error('Error fetching minutes PDF:', error);
    return null;
  }
}

// Fetch resolution attachments (resolution PDF + staff recommendations) for a specific resolution
// Each resolution has multiple attachments grouped under a section header in the sidebar
export async function fetchCivicClerkResolutionAttachments(
  eventId: number,
  resolutionNumber: string
): Promise<{ resolution: string | null; staffReport: string | null }> {
  const { chromium } = await import('playwright');
  const result: { resolution: string | null; staffReport: string | null } = {
    resolution: null,
    staffReport: null,
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    const eventUrl = `${DATA_SOURCES.civicClerk.baseUrl}/event/${eventId}/files`;
    console.log(`Fetching resolution ${resolutionNumber} attachments from event ${eventId}...`);
    await page.goto(eventUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Get all sidebar text to find resolution attachments
    const sidebarItems = await page.evaluate(() => {
      const allText = document.body.innerText;
      return allText.split('\n').filter(l => l.trim()).map(l => l.trim());
    });

    // Find attachments for this resolution
    // Pattern: section header "a. Consider Resolution XX-XXX..." followed by child attachments
    // Resolution number may appear with various prefixes: "Resolution 25-012", "Resolution No 25-012", "25-012"
    const resolutionPattern = new RegExp(`(Resolution\\s+(No\\.?\\s+)?)?${resolutionNumber}`, 'i');
    let inResolutionSection = false;
    const attachmentsToFetch: { text: string; type: 'resolution' | 'staffReport' }[] = [];

    for (const item of sidebarItems) {
      // Check if this is a section header for our resolution
      if (item.match(/^[a-z]\.\s+Consider/i) && resolutionPattern.test(item)) {
        inResolutionSection = true;
        continue;
      }

      // Check if we've moved to the next section
      if (inResolutionSection && item.match(/^[a-z]\.\s+/i) && !resolutionPattern.test(item)) {
        break; // Done with this resolution's section
      }

      // Collect relevant attachments within the resolution section
      if (inResolutionSection) {
        // Resolution PDF patterns:
        // - "0 - Resolution 25-014 Public Streets..."
        // - "00 - 26-001 Street Dedication Resolution..."
        // - "Resolution 26-002 FY2025 Closure..."
        // - "Resolution No 25-012 Budget Amendments..."
        const isResolutionPdf =
          item.match(/^0+\s*-\s*Resolution/i) ||  // "0 - Resolution" or "00 - Resolution"
          item.match(/^0+\s*-\s*\d+-\d+/i) ||     // "00 - 26-001" (number at start)
          (item.match(/^Resolution\s+(No\.?\s+)?\d+-\d+/i) && resolutionPattern.test(item));  // "Resolution [No] XX-XXX"

        if (isResolutionPdf) {
          attachmentsToFetch.push({ text: item, type: 'resolution' });
        }
        // Staff Recommendations / Executive Summary
        else if (item.match(/Staff\s+Recommend/i) || item.match(/Executive\s+Summary/i)) {
          attachmentsToFetch.push({ text: item, type: 'staffReport' });
        }
      }
    }

    console.log(`Found ${attachmentsToFetch.length} attachments to fetch for resolution ${resolutionNumber}`);

    // Helper to click an item and extract PDF URL
    const fetchPdfByText = async (searchText: string): Promise<string | null> => {
      try {
        // Find and click the item in the sidebar
        const clicked = await page.evaluate((text) => {
          const items = document.querySelectorAll('li.MuiListItem-container, li.MuiListItem-root');
          for (const item of items) {
            const itemText = item.textContent?.trim() || '';
            if (itemText.includes(text.substring(0, 30))) {
              const button = item.querySelector('button, [role="button"]');
              if (button) {
                (button as HTMLElement).click();
                return true;
              }
            }
          }
          return false;
        }, searchText);

        if (!clicked) {
          console.log(`Could not find sidebar item: ${searchText.substring(0, 50)}...`);
          return null;
        }

        // Wait for iframe to load
        await page.waitForTimeout(1500);

        // Extract PDF URL from iframe
        const pdfUrl = await page.evaluate(() => {
          const iframe = document.querySelector('iframe[src*="pdfjs"]');
          if (!iframe) return null;
          const src = iframe.getAttribute('src') || '';
          const fileMatch = src.match(/file=([^&]+)/);
          return fileMatch ? decodeURIComponent(fileMatch[1]) : null;
        });

        if (!pdfUrl) {
          console.log(`No PDF URL found for: ${searchText.substring(0, 50)}...`);
          return null;
        }

        // Fetch the PDF
        const response = await fetch(pdfUrl, {
          headers: { 'User-Agent': 'FloweryBranchCivicDashboard/1.0' },
        });

        if (!response.ok) {
          console.log(`Failed to fetch PDF: ${response.status}`);
          return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
      } catch (error) {
        console.error(`Error fetching PDF for ${searchText.substring(0, 30)}:`, error);
        return null;
      }
    };

    // Fetch each attachment
    for (const attachment of attachmentsToFetch) {
      const pdfBase64 = await fetchPdfByText(attachment.text);
      if (pdfBase64) {
        if (attachment.type === 'resolution') {
          result.resolution = pdfBase64;
          console.log(`Fetched resolution PDF for ${resolutionNumber}`);
        } else if (attachment.type === 'staffReport') {
          result.staffReport = pdfBase64;
          console.log(`Fetched staff report for ${resolutionNumber}`);
        }
      }
    }

    return result;
  } catch (error) {
    console.error(`Failed to fetch resolution attachments for ${resolutionNumber}:`, error);
    return result;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function scrapeCivicClerkMeetingsWithPlaywright(): Promise<CivicClerkMeeting[]> {
  const meetings: CivicClerkMeeting[] = [];
  const baseUrl = DATA_SOURCES.civicClerk.baseUrl;

  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    // First, get all event IDs from the main page
    console.log('Navigating to CivicClerk portal...');
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Scroll to load more events
    console.log('Loading events...');
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
    }
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(400);
    }

    // Extract unique event IDs
    const eventIds = await page.$$eval('a[href*="/event/"]', (links) => {
      const ids = new Set<number>();
      links.forEach(link => {
        const href = (link as HTMLAnchorElement).href;
        const match = href.match(/\/event\/(\d+)/);
        if (match) ids.add(parseInt(match[1]));
      });
      return Array.from(ids);
    });

    console.log(`Found ${eventIds.length} unique event IDs, fetching details...`);

    // Visit each event's detail page to get accurate data
    // Rate limiting: 1.5s delay between requests to be respectful of public resources
    for (const eventId of eventIds) {
      try {
        const eventUrl = `${baseUrl}/event/${eventId}/files`;
        await page.goto(eventUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1500); // Respectful delay between requests

        // Extract date from the page title/header
        // Format: "City Council Meeting - January 07, 2026"
        const pageTitle = await page.title();
        const headerText = await page.evaluate(() => {
          const h1 = document.querySelector('h1, [class*="title"], header');
          return h1?.textContent || document.title || '';
        });

        const combinedText = `${pageTitle} ${headerText}`;

        // Parse date - look for "Month DD, YYYY" pattern
        const dateMatch = combinedText.match(/([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
        let dateStr = '';
        if (dateMatch) {
          const monthNames: Record<string, string> = {
            'january': '01', 'february': '02', 'march': '03', 'april': '04',
            'may': '05', 'june': '06', 'july': '07', 'august': '08',
            'september': '09', 'october': '10', 'november': '11', 'december': '12'
          };
          const month = monthNames[dateMatch[1].toLowerCase()] || '01';
          const day = dateMatch[2].padStart(2, '0');
          const year = dateMatch[3];
          dateStr = `${year}-${month}-${day}`;
        }

        // Determine meeting type from title
        const titleLower = combinedText.toLowerCase();
        let type = 'other';
        let title = 'City Meeting';
        if (titleLower.includes('city council')) {
          type = 'city_council';
          title = 'City Council Meeting';
        } else if (titleLower.includes('planning')) {
          type = 'planning';
          title = 'Planning Commission Meeting';
        } else if (titleLower.includes('work session')) {
          type = 'work_session';
          title = 'Work Session';
        }

        // Check for minutes link
        const hasMinutes = await page.evaluate(() => {
          const text = document.body.textContent || '';
          return text.toLowerCase().includes('minutes');
        });

        if (dateStr) {
          meetings.push({
            eventId,
            date: dateStr,
            title,
            location: '5410 Pine Street, Flowery Branch, GA 30542',
            type,
            agendaUrl: eventUrl,
            minutesUrl: hasMinutes ? `${baseUrl}/event/${eventId}/files` : undefined,
            mediaUrl: `${baseUrl}/event/${eventId}/media`,
          });
          console.log(`  Event ${eventId}: ${title} on ${dateStr}`);
        } else {
          console.log(`  Event ${eventId}: Could not parse date from "${combinedText.substring(0, 100)}"`);
        }
      } catch (error) {
        console.error(`  Failed to fetch event ${eventId}:`, error);
      }
    }

    console.log(`Successfully scraped ${meetings.length} meetings`);

  } catch (error) {
    console.error('Failed to scrape CivicClerk meetings:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  // Sort by date descending
  return meetings.sort((a, b) => b.date.localeCompare(a.date));
}

// Parse PDF text to extract business data
export function parseBusinessPdfText(text: string, month: string, sourceUrl: string): {
  id: string;
  month: string;
  name: string;
  address?: string;
  type?: string;
  sourceUrl: string;
}[] {
  const businesses: ReturnType<typeof parseBusinessPdfText> = [];

  // Split by lines
  const lines = text.split('\n').filter(line => line.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip header lines and empty content
    if (
      line.toLowerCase().includes('business name') ||
      line.toLowerCase().includes('new business') ||
      line.toLowerCase().includes('city of flowery') ||
      line.length < 3
    ) {
      continue;
    }

    // Look for business name patterns (usually capitalized or at start of line)
    // Businesses often have an address on the next line
    const isLikelyBusinessName =
      /^[A-Z]/.test(line) &&
      !line.match(/^\d+\s+/) && // Not starting with street number
      line.length > 3 &&
      line.length < 100;

    if (isLikelyBusinessName) {
      const business: (typeof businesses)[0] = {
        id: `business-${month}-${businesses.length}`,
        month,
        name: line,
        sourceUrl,
      };

      // Check if next line is an address
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const addressMatch = nextLine.match(/(\d+\s+[A-Za-z\s]+)/);
        if (addressMatch) {
          business.address = addressMatch[1].trim();
          i++; // Skip the address line
        }
      }

      businesses.push(business);
    }
  }

  return businesses;
}

// Detect the action type from an agenda item title
function detectOrdinanceAction(title: string): string {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes('first reading')) return 'first_reading';
  if (lowerTitle.includes('second reading')) return 'second_reading';
  if (lowerTitle.includes('adopt') || lowerTitle.includes('adoption')) return 'adopted';
  if (lowerTitle.includes('introduc')) return 'introduced';
  if (lowerTitle.includes('amend')) return 'amended';
  if (lowerTitle.includes('table')) return 'tabled';
  if (lowerTitle.includes('deny') || lowerTitle.includes('denied')) return 'denied';
  if (lowerTitle.includes('withdraw')) return 'withdrawn';

  return 'discussed';
}

// Extract ordinance number from text (handles various formats)
function extractOrdinanceNumber(text: string): string | null {
  // Pattern 1: "Ordinance 2024-001" or "Ordinance #2024-001"
  let match = text.match(/ordinance\s*#?\s*(\d{4}[-–]\d+)/i);
  if (match) return match[1].replace('–', '-');

  // Pattern 2: "Ordinance 123" (just a number)
  match = text.match(/ordinance\s*#?\s*(\d+)/i);
  if (match) return match[1];

  // Pattern 3: Reference number like "Ordinance 2024-001"
  match = text.match(/(\d{4}[-–]\d+)/);
  if (match) return match[1].replace('–', '-');

  return null;
}

// Link ordinances to meetings based on agenda items
export interface LinkResult {
  linked: number;
  notFound: string[];
  errors: string[];
}

export function linkOrdinancesToMeetings(): LinkResult {
  const result: LinkResult = {
    linked: 0,
    notFound: [],
    errors: [],
  };

  try {
    const db = getDb();

    // Get all agenda items that mention ordinances
    const agendaItems = getAgendaItemsWithOrdinances();
    console.log(`Found ${agendaItems.length} agenda items mentioning ordinances`);

    // Track what we've seen to avoid duplicates
    const seen = new Set<string>();

    for (const item of agendaItems) {
      try {
        // Try to extract ordinance number from reference_number or title
        let ordinanceNum = item.reference_number
          ? extractOrdinanceNumber(item.reference_number)
          : null;

        if (!ordinanceNum) {
          ordinanceNum = extractOrdinanceNumber(item.title);
        }

        if (!ordinanceNum) {
          // No ordinance number found, skip
          continue;
        }

        // Create a unique key to avoid duplicate links
        const key = `${item.meeting_id}-${ordinanceNum}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Find the ordinance in the database
        // Try exact match first, then year-prefixed versions
        let ordinance = getOrdinanceByNumber(ordinanceNum);

        // If not found and it's just a number, try with current/recent year prefixes
        if (!ordinance && !ordinanceNum.includes('-')) {
          const currentYear = new Date().getFullYear();
          for (let year = currentYear; year >= currentYear - 5; year--) {
            ordinance = getOrdinanceByNumber(`${year}-${ordinanceNum.padStart(3, '0')}`);
            if (ordinance) break;
          }
        }

        if (!ordinance) {
          // Try finding by partial match in the database
          const partialMatch = db.prepare(`
            SELECT * FROM ordinances WHERE number LIKE ?
          `).get(`%${ordinanceNum}%`) as { id: string; number: string } | undefined;

          if (partialMatch) {
            ordinance = partialMatch as unknown as typeof ordinance;
          }
        }

        if (!ordinance) {
          result.notFound.push(`Ordinance ${ordinanceNum} (from meeting ${item.meeting_id})`);
          continue;
        }

        // Detect the action from the agenda item title
        const action = detectOrdinanceAction(item.title);

        // Create the relationship
        insertOrdinanceMeeting(ordinance.id, item.meeting_id, action);
        result.linked++;
        console.log(`Linked: Ordinance ${ordinance.number} → Meeting ${item.meeting_id} (${action})`);

      } catch (err) {
        result.errors.push(`Error processing agenda item: ${err}`);
      }
    }

    console.log(`Linking complete: ${result.linked} links created, ${result.notFound.length} ordinances not found`);

  } catch (err) {
    result.errors.push(`Fatal error: ${err}`);
  }

  return result;
}

// Update ordinance adoption dates from linked meeting dates
// This uses the meeting date where the ordinance had its second_reading or was adopted
export function updateOrdinanceDatesFromMeetings(): number {
  const db = getDb();

  // Update adopted_date from meeting dates where action indicates adoption
  const result = db.prepare(`
    UPDATE ordinances
    SET adopted_date = (
      SELECT m.date
      FROM ordinance_meetings om
      JOIN meetings m ON m.id = om.meeting_id
      WHERE om.ordinance_id = ordinances.id
        AND om.action IN ('adopted', 'second_reading', 'approved')
      ORDER BY m.date DESC
      LIMIT 1
    ),
    updated_at = datetime('now')
    WHERE EXISTS (
      SELECT 1 FROM ordinance_meetings om
      JOIN meetings m ON m.id = om.meeting_id
      WHERE om.ordinance_id = ordinances.id
        AND om.action IN ('adopted', 'second_reading', 'approved')
    )
  `).run();

  console.log(`Updated ${result.changes} ordinance adoption dates from meeting dates`);
  return result.changes;
}

// Extract resolutions from agenda items and store in resolutions table
// If meetingId is provided, only extract from that specific meeting
export function extractResolutionsFromAgendaItems(meetingId?: string): number {
  const db = getDb();

  // Get resolution agenda items with meeting info
  // Optionally filter by meeting ID
  const query = meetingId
    ? `SELECT DISTINCT ai.reference_number, ai.title, ai.outcome,
             m.date as meeting_date, m.id as meeting_id, m.packet_url
       FROM agenda_items ai
       JOIN meetings m ON ai.meeting_id = m.id
       WHERE ai.type = 'resolution'
         AND ai.reference_number IS NOT NULL
         AND m.id = ?
       ORDER BY m.date DESC`
    : `SELECT DISTINCT ai.reference_number, ai.title, ai.outcome,
             m.date as meeting_date, m.id as meeting_id, m.packet_url
       FROM agenda_items ai
       JOIN meetings m ON ai.meeting_id = m.id
       WHERE ai.type = 'resolution'
         AND ai.reference_number IS NOT NULL
       ORDER BY m.date DESC`;

  const resolutionItems = (meetingId
    ? db.prepare(query).all(meetingId)
    : db.prepare(query).all()) as Array<{
    reference_number: string;
    title: string;
    outcome: string | null;
    meeting_date: string;
    meeting_id: string;
    packet_url: string | null;
  }>;

  // Group by resolution number (some appear in multiple meetings)
  const resolutionMap = new Map<string, {
    number: string;
    title: string;
    status: string;
    introducedDate: string;
    adoptedDate: string | null;
    meetingId: string;
    packetUrl: string | null;
  }>();

  for (const item of resolutionItems) {
    const existing = resolutionMap.get(item.reference_number);

    // Clean title - remove "Consider Resolution XX-XXX" prefix
    let cleanTitle = item.title
      .replace(/^Consider\s+Resolution\s+[\d-]+\s*/i, '')
      .replace(/^to\s+/i, '')
      .trim();

    // Capitalize first letter
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

    // Determine status from outcome
    let status = 'adopted'; // Default assumption for city resolutions
    if (item.outcome) {
      const outcomeLower = item.outcome.toLowerCase();
      if (outcomeLower.includes('approved') || outcomeLower.includes('adopted') || outcomeLower.includes('passed')) {
        status = 'adopted';
      } else if (outcomeLower.includes('rejected') || outcomeLower.includes('denied')) {
        status = 'rejected';
      } else if (outcomeLower.includes('tabled')) {
        status = 'tabled';
      }
    }

    if (!existing) {
      // First occurrence - this is likely the introduction
      resolutionMap.set(item.reference_number, {
        number: item.reference_number,
        title: cleanTitle || item.title,
        status,
        introducedDate: item.meeting_date,
        adoptedDate: status === 'adopted' ? item.meeting_date : null,
        meetingId: item.meeting_id,
        packetUrl: item.packet_url,
      });
    } else {
      // Subsequent occurrence - update if adopted later
      if (status === 'adopted' && !existing.adoptedDate) {
        existing.adoptedDate = item.meeting_date;
        existing.status = 'adopted';
      }
      // Keep the earliest introduced date
      if (item.meeting_date < existing.introducedDate) {
        existing.introducedDate = item.meeting_date;
      }
    }
  }

  // Insert all resolutions
  let count = 0;
  for (const resolution of resolutionMap.values()) {
    insertResolution({
      id: `resolution-${resolution.number}`,
      number: resolution.number,
      title: resolution.title,
      status: resolution.status,
      introducedDate: resolution.introducedDate || undefined,
      adoptedDate: resolution.adoptedDate || undefined,
      meetingId: resolution.meetingId || undefined,
      packetUrl: resolution.packetUrl || undefined,
    });
    count++;
  }

  console.log(`Extracted ${count} resolutions from agenda items`);
  return count;
}
