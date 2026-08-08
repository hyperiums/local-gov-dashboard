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
  // Every number the item references. One item can move several ordinances at
  // once ("Ordinances 702-A and 715-A"); referenceNumber holds the first.
  referenceNumbers?: string[];
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

// Carries the status code so callers can tell "not posted" (404) from
// "we were refused" (403) instead of seeing one opaque failure.
export class HttpStatusError extends Error {
  constructor(readonly status: number, url: string) {
    super(`Failed to fetch PDF ${url}: ${status}`);
    this.name = 'HttpStatusError';
  }
}

// Fetch PDF and return buffer
export async function fetchPdf(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'FloweryBranchCivicDashboard/1.0 (civic transparency project)',
    },
  });
  if (!response.ok) {
    throw new HttpStatusError(response.status, url);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Why a document is absent decides whether anyone should be alarmed: a 404
// across every candidate URL means the city has not posted that month yet,
// while a 403 or a connection error means we never got to look. Collapsing
// both to "not found" is what let a blocked server report clean runs for
// months — production is served 403 by the city's CDN while a browser on a
// residential IP gets the same URL fine.
export type PdfFetchFailure = 'not_published' | 'unreachable';

export type PdfFetchResult =
  | { ok: true; buffer: Buffer; url: string }
  | { ok: false; reason: PdfFetchFailure; status?: number; detail: string };

// Try multiple URLs until one works, reporting why the whole set failed.
export async function fetchPdfDiagnosed(urls: string[]): Promise<PdfFetchResult> {
  let sawMissing = false;
  let blocker: { status?: number; detail: string } | null = null;

  for (const url of urls) {
    try {
      return { ok: true, buffer: await fetchPdf(url), url };
    } catch (error) {
      if (error instanceof HttpStatusError) {
        if (error.status === 404 || error.status === 410) {
          sawMissing = true;
          continue;
        }
        // Keep the first non-404 — it is the most informative failure.
        blocker ??= { status: error.status, detail: `HTTP ${error.status} from ${url}` };
        continue;
      }
      blocker ??= {
        detail: `${error instanceof Error ? error.message : String(error)} (${url})`,
      };
    }
  }

  if (blocker) {
    return { ok: false, reason: 'unreachable', status: blocker.status, detail: blocker.detail };
  }
  return {
    ok: false,
    reason: 'not_published',
    detail: sawMissing
      ? `all ${urls.length} candidate URLs returned 404`
      : 'no candidate URLs to try',
  };
}

// Try multiple URLs until one works
export async function fetchPdfWithFallback(
  urls: string[]
): Promise<{ buffer: Buffer; url: string } | null> {
  const result = await fetchPdfDiagnosed(urls);
  return result.ok ? { buffer: result.buffer, url: result.url } : null;
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
