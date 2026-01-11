// Shared utilities for scraper modules

// Month name mappings for URL construction
export const MONTH_NAMES: Record<string, string> = {
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
export const ALT_MONTH_NAMES: Record<string, string[]> = {
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

// Shared interfaces
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
export async function fetchHtml(url: string): Promise<string> {
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

// Try multiple URLs until one works
export async function fetchPdfWithFallback(
  urls: string[]
): Promise<{ buffer: Buffer; url: string } | null> {
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

// Convert month name to number
export function getMonthNumber(monthName: string): string {
  const months: Record<string, string> = {
    january: '01',
    jan: '01',
    february: '02',
    feb: '02',
    march: '03',
    mar: '03',
    april: '04',
    apr: '04',
    may: '05',
    june: '06',
    jun: '06',
    july: '07',
    jul: '07',
    august: '08',
    aug: '08',
    september: '09',
    sep: '09',
    sept: '09',
    october: '10',
    oct: '10',
    november: '11',
    nov: '11',
    december: '12',
    dec: '12',
  };
  return months[monthName.toLowerCase()] || '01';
}
