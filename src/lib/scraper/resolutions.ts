// Resolution and ordinance scraping/linking utilities
import { DATA_SOURCES } from '../types';
import {
  getAgendaItemsWithOrdinances,
  getOrdinanceByNumber,
  insertOrdinance,
  insertOrdinanceMeeting,
  insertResolution,
  getDb,
} from '../db';
import { fetchPdf } from './utils';
import { classifyReading, extractOrdinanceNumbers, normalizeRefText } from '../ordinanceRefs';

// Extract a clean ordinance title from an agenda item title
// e.g., "Public Hearing and Second Reading of Ordinance 724 to Consider a Variance Request..."
// → "Variance Request at 4627 Atlanta Highway"
function extractOrdinanceTitleFromAgenda(agendaTitle: string): string {
  // Try to extract the substantive description after "Ordinance XXX to"
  const patterns = [
    /Ordinance\s+\d+\s+to\s+(?:Consider\s+)?(.+)/i,
    /(?:Consider|Approve)\s+Ordinance\s+\d+[:\s-]+(.+)/i,
    /Ordinance\s+\d+\s*[-:]\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = agendaTitle.match(pattern);
    if (match && match[1]) {
      // Clean up the title
      let title = match[1].trim();
      // Remove trailing punctuation
      title = title.replace(/[.;,]$/, '');
      // Capitalize first letter
      title = title.charAt(0).toUpperCase() + title.slice(1);
      return title;
    }
  }

  // Fallback: extract anything after "Ordinance XXX"
  const fallbackMatch = agendaTitle.match(/Ordinance\s+\d+\s+(.+)/i);
  if (fallbackMatch && fallbackMatch[1]) {
    return fallbackMatch[1].trim();
  }

  return agendaTitle;
}

// Detect the status of an ordinance from the agenda item title
function detectOrdinanceStatusFromAgenda(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('second reading') || lower.includes('adopt')) {
    return 'adopted';
  }
  if (lower.includes('first reading') || lower.includes('introduc')) {
    return 'proposed';
  }
  return 'proposed';
}

// Create an ordinance record from agenda item data
// This allows ordinances to be tracked even before they appear in Municode
export function createOrdinanceFromAgendaItem(
  ordinanceNumber: string,
  agendaItemTitle: string,
  meetingDate: string
): void {
  const title = extractOrdinanceTitleFromAgenda(agendaItemTitle);
  const status = detectOrdinanceStatusFromAgenda(agendaItemTitle);

  insertOrdinance({
    id: `ordinance-${ordinanceNumber}`,
    number: ordinanceNumber,
    title: title || `Ordinance ${ordinanceNumber}`,
    status,
    introducedDate: meetingDate,
    // Leave municodeUrl and summary NULL for later enrichment by Municode scrape
  });

  console.log(`Auto-created ordinance ${ordinanceNumber}: "${title}" (${status})`);
}

export interface ResolutionAttachmentRef {
  text: string;
  type: 'resolution' | 'staffReport';
}

// Classify the sidebar file list of a CivicClerk event into the resolution
// document and its staff report / executive summary, for one resolution.
//
// Attachments are grouped under agenda-item headers ("b. Consider
// Resolution 26-006, ..."). Once we're inside the right section, the file
// naming varies: the city names resolution PDFs by TOPIC ("Resolution
// assistant solicitor"), by number ("Resolution No. 26-006"), or with a
// legacy zero prefix ("00 - Resolution ..."). Matching on the leading
// word rather than requiring the number in the filename is what lets
// topic-named resolutions be found at all.
export function classifyResolutionAttachments(
  sidebarItems: string[],
  resolutionNumber: string
): ResolutionAttachmentRef[] {
  const resolutionPattern = new RegExp(
    `(Resolution\\s+(No\\.?\\s+)?)?${resolutionNumber}`,
    'i'
  );
  let inResolutionSection = false;
  const attachments: ResolutionAttachmentRef[] = [];

  for (const item of sidebarItems) {
    // Section header for our resolution
    if (/^[a-z]\.\s+Consider/i.test(item) && resolutionPattern.test(item)) {
      inResolutionSection = true;
      continue;
    }

    // Reached the next agenda item — this section is done
    if (
      inResolutionSection &&
      /^[a-z]\.\s+/i.test(item) &&
      !resolutionPattern.test(item)
    ) {
      break;
    }

    if (!inResolutionSection) continue;

    // Staff report / executive summary. Check these FIRST: they are often
    // titled with "Resolution" in them ("ES - Reimbursement Resolution ...",
    // "Executive Summary - for resolution for solicitor") and would
    // otherwise be mistaken for the resolution document itself.
    if (
      /^ES\b/i.test(item) ||
      /Executive\s+Summary/i.test(item) ||
      /Staff\s+Recommend/i.test(item)
    ) {
      attachments.push({ text: item, type: 'staffReport' });
    } else if (/resolution/i.test(item) || /^0+\s*-\s*\d+-\d+/i.test(item)) {
      // The resolution PDF is the file naming "Resolution" — the city puts
      // that word at the start ("Resolution assistant solicitor"), end
      // ("... Comp Plan Adoption Resolution"), or middle ("REIMBURSEMENT
      // RESOLUTION - 2026-013"). Bounded to this agenda section, any such
      // file is the resolution. (The legacy "00 - 26-006" numbered form
      // has no "Resolution" word, hence the second pattern.)
      attachments.push({ text: item, type: 'resolution' });
    }
  }

  return attachments;
}

// Fetch resolution attachments (resolution PDF + staff recommendations) for a specific resolution
// Each resolution has multiple attachments grouped under a section header in the sidebar
// Falls back to extracting S3 PDF links from the iframe viewer for older meetings
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
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    const eventUrl = `${DATA_SOURCES.civicClerk.baseUrl}/event/${eventId}/files`;
    console.log(
      `Fetching resolution ${resolutionNumber} attachments from event ${eventId}...`
    );
    await page.goto(eventUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Get all sidebar text to find resolution attachments
    const sidebarItems = await page.evaluate(() => {
      const allText = document.body.innerText;
      return allText
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => l.trim());
    });

    // Find attachments for this resolution (section header "a. Consider
    // Resolution XX-XXX..." followed by its child attachment files)
    const attachmentsToFetch = classifyResolutionAttachments(
      sidebarItems,
      resolutionNumber
    );

    console.log(
      `Found ${attachmentsToFetch.length} attachments to fetch for resolution ${resolutionNumber}`
    );

    // If no sidebar attachments found, extract PDF links from PDF.js viewer annotations
    // This handles older meetings where PDFs are embedded as hyperlinks in the agenda PDF
    if (attachmentsToFetch.length === 0) {
      console.log(
        `Resolution ${resolutionNumber}: No sidebar attachments, extracting PDF links from viewer...`
      );

      // Wait for PDF.js viewer to fully load
      await page.waitForTimeout(3000);

      // Extract PDF link annotations via PDF.js API
      const pdfLinks = await page.evaluate(async () => {
        const links: string[] = [];
        try {
          const iframe = document.getElementById('pdfViewerIframe') as HTMLIFrameElement;
          if (!iframe?.contentWindow) return links;

          // Access PDF.js viewer application
          const pdfApp = (iframe.contentWindow as Window & { PDFViewerApplication?: {
            pdfDocument?: {
              numPages: number;
              getPage: (num: number) => Promise<{
                getAnnotations: () => Promise<Array<{ subtype: string; url?: string }>>;
              }>;
            };
          } }).PDFViewerApplication;

          if (!pdfApp?.pdfDocument) return links;

          const pdfDoc = pdfApp.pdfDocument;
          const numPages = Math.min(pdfDoc.numPages, 5); // Check first 5 pages

          for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const pdfPage = await pdfDoc.getPage(pageNum);
            const annotations = await pdfPage.getAnnotations();

            for (const annot of annotations) {
              if (annot.subtype === 'Link' && annot.url) {
                links.push(annot.url);
              }
            }
          }
        } catch (e) {
          console.error('PDF.js extraction error:', e);
        }
        return links;
      });

      console.log(`Found ${pdfLinks.length} PDF links in viewer annotations`);

      // Find matching resolution PDF and executive summary
      const resNumClean = resolutionNumber.replace(/-/g, '[-_]?');
      const resPattern = new RegExp(`Resolution[_-]?${resNumClean}`, 'i');
      const summaryPattern = new RegExp(`Executive[_-]?Summary.*${resNumClean}`, 'i');

      for (const url of pdfLinks) {
        // Check for resolution PDF
        if (!result.resolution && resPattern.test(url)) {
          console.log(`Found resolution PDF: ${url.substring(0, 80)}...`);
          try {
            const buffer = await fetchPdf(url);
            result.resolution = buffer.toString('base64');
            console.log(`Fetched resolution PDF for ${resolutionNumber} from S3`);
          } catch (error) {
            console.error(`Failed to fetch resolution PDF: ${error}`);
          }
        }
        // Check for executive summary
        if (!result.staffReport && summaryPattern.test(url)) {
          console.log(`Found executive summary: ${url.substring(0, 80)}...`);
          try {
            const buffer = await fetchPdf(url);
            result.staffReport = buffer.toString('base64');
            console.log(`Fetched executive summary for ${resolutionNumber} from S3`);
          } catch (error) {
            console.error(`Failed to fetch executive summary: ${error}`);
          }
        }

        // Stop if we have both
        if (result.resolution && result.staffReport) break;
      }
    }

    // Helper to click an item and extract PDF URL
    const fetchPdfByText = async (searchText: string): Promise<string | null> => {
      try {
        const clicked = await page.evaluate((text) => {
          const items = document.querySelectorAll(
            'li.MuiListItem-container, li.MuiListItem-root'
          );
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

        await page.waitForTimeout(1500);

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

        const buffer = await fetchPdf(pdfUrl);
        return buffer.toString('base64');
      } catch (error) {
        console.error(
          `Error fetching PDF for ${searchText.substring(0, 30)}:`,
          error
        );
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
    console.error(
      `Failed to fetch resolution attachments for ${resolutionNumber}:`,
      error
    );
    return result;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Link results interface
export interface LinkResult {
  linked: number;
  notFound: string[];
  errors: string[];
  /** Auto-created ordinance records dropped because nothing references them. */
  removedArtifacts?: string[];
}

// Detect the action type from an agenda item title
function detectOrdinanceAction(title: string): string {
  const lowerTitle = title.toLowerCase();

  // Reading first: it is the most specific signal, and the wording the city
  // uses ("Second Read to Consider…") is not the phrase a substring test for
  // "second reading" would catch.
  const reading = classifyReading(title);
  if (reading === 'first') return 'first_reading';
  if (reading === 'second') return 'second_reading';

  if (lowerTitle.includes('adopt') || lowerTitle.includes('adoption'))
    return 'adopted';
  if (lowerTitle.includes('introduc')) return 'introduced';
  if (lowerTitle.includes('amend')) return 'amended';
  // Only a motion to table, never an incidental mention. Zoning text
  // amendments cite "Table 9.1" and were being recorded as tabled.
  if (/\b(?:tabled|to\s+table|motion\s+to\s+table)\b/i.test(lowerTitle))
    return 'tabled';
  if (lowerTitle.includes('deny') || lowerTitle.includes('denied'))
    return 'denied';
  if (lowerTitle.includes('withdraw')) return 'withdrawn';

  return 'discussed';
}

// Every ordinance number a piece of text references, newest parser shared with
// the agenda scraper and the vote-outcome pass so the three cannot drift.
function extractOrdinanceNumbersFrom(text: string): string[] {
  const numbers = extractOrdinanceNumbers(text);
  if (numbers.length > 0) return numbers;

  // Older records carry a bare year-prefixed number with no "Ordinance" word.
  const bare = normalizeRefText(text).match(/\b(\d{4}-\d+)\b/);
  return bare ? [bare[1]] : [];
}

// Link ordinances to meetings based on agenda items
export function linkOrdinancesToMeetings(): LinkResult {
  const result: LinkResult = {
    linked: 0,
    notFound: [],
    errors: [],
  };

  try {
    const db = getDb();

    const agendaItems = getAgendaItemsWithOrdinances();
    console.log(`Found ${agendaItems.length} agenda items mentioning ordinances`);

    const seen = new Set<string>();

    for (const item of agendaItems) {
      try {
        // The title is the richer source: reference_number holds only the first
        // of what may be several ordinances moved by one item.
        const ordinanceNums = [
          ...new Set([
            ...extractOrdinanceNumbersFrom(item.title),
            ...(item.reference_number ? extractOrdinanceNumbersFrom(item.reference_number) : []),
          ]),
        ];

        if (ordinanceNums.length === 0) {
          continue;
        }

        const action = detectOrdinanceAction(item.title);

        for (const ordinanceNum of ordinanceNums) {
          const key = `${item.meeting_id}-${ordinanceNum}`;
          if (seen.has(key)) continue;
          seen.add(key);

          let ordinance = getOrdinanceByNumber(ordinanceNum);

          if (!ordinance && !ordinanceNum.includes('-')) {
            const currentYear = new Date().getFullYear();
            for (let year = currentYear; year >= currentYear - 5; year--) {
              ordinance = getOrdinanceByNumber(
                `${year}-${ordinanceNum.padStart(3, '0')}`
              );
              if (ordinance) break;
            }
          }

          if (!ordinance) {
            const partialMatch = db
              .prepare(`SELECT * FROM ordinances WHERE number LIKE ?`)
              .get(`%${ordinanceNum}%`) as
              | { id: string; number: string }
              | undefined;

            if (partialMatch) {
              ordinance = partialMatch as unknown as typeof ordinance;
            }
          }

          if (!ordinance) {
            // The agenda names an ordinance we have no record of — typically a
            // lettered amendment like 702-A that only ever appears in agenda
            // titles and never gets published to Municode on its own. Create it
            // from what the agenda says rather than dropping it, so linking
            // heals stored agenda items without waiting for a re-scrape.
            createOrdinanceFromAgendaItem(ordinanceNum, item.title, item.meeting_date);
            ordinance = getOrdinanceByNumber(ordinanceNum);

            if (!ordinance) {
              result.notFound.push(
                `Ordinance ${ordinanceNum} (from meeting ${item.meeting_id})`
              );
              continue;
            }
          }

          insertOrdinanceMeeting(ordinance.id, item.meeting_id, action);
          result.linked++;
          console.log(
            `Linked: Ordinance ${ordinance.number} → Meeting ${item.meeting_id} (${action})`
          );
        }
      } catch (err) {
        result.errors.push(`Error processing agenda item: ${err}`);
      }
    }

    console.log(
      `Linking complete: ${result.linked} links created, ${result.notFound.length} ordinances not found`
    );

    result.removedArtifacts = removeUnreferencedAgendaOrdinances();
  } catch (err) {
    result.errors.push(`Fatal error: ${err}`);
  }

  return result;
}

/**
 * Drop ordinance records that were invented from an agenda title and are no
 * longer referenced by any agenda item.
 *
 * Reading "Ordinance 239-N / 240-N" as plain "239" created a record for an
 * ordinance the council never acted on — the city clerk read the caption for
 * 239-N and 240-N, and the motion was to approve 239-N and 240-N. Now that the
 * reference parses correctly, nothing points at the stray record, and leaving
 * it would show residents a phantom pending ordinance.
 *
 * Deliberately narrow: only records this pipeline auto-created from an agenda
 * (`ordinance-` id prefix), never published to Municode, and referenced by no
 * remaining agenda item. Anything the city actually published is untouched, and
 * a genuine ordinance that reappears on an agenda is simply recreated.
 */
export function removeUnreferencedAgendaOrdinances(): string[] {
  const db = getDb();

  const referenced = new Set<string>();
  for (const item of getAgendaItemsWithOrdinances()) {
    for (const num of extractOrdinanceNumbersFrom(item.title)) referenced.add(num);
    if (item.reference_number) {
      for (const num of extractOrdinanceNumbersFrom(item.reference_number)) referenced.add(num);
    }
  }

  const candidates = db.prepare(`
    SELECT id, number FROM ordinances
    WHERE id LIKE 'ordinance-%'
      AND municode_url IS NULL
      AND adopted_date IS NULL
      AND status NOT IN ('adopted', 'denied', 'rejected', 'tabled')
  `).all() as { id: string; number: string }[];

  const removed: string[] = [];
  for (const candidate of candidates) {
    if (referenced.has(candidate.number)) continue;

    db.prepare('DELETE FROM ordinance_meetings WHERE ordinance_id = ?').run(candidate.id);
    db.prepare('DELETE FROM ordinances WHERE id = ?').run(candidate.id);
    removed.push(candidate.number);
    console.log(`Removed unreferenced auto-created ordinance ${candidate.number}`);
  }

  return removed;
}

// Update ordinance adoption dates from linked meeting dates
export function updateOrdinanceDatesFromMeetings(): number {
  const db = getDb();

  // Only a recorded adoption vote sets an adoption date, and it sets the status
  // in the same breath. Accepting a bare 'second_reading' meant an agenda
  // *scheduling* a second read was treated as the ordinance having passed one —
  // and because only the date was written and not the status, the ordinance fell
  // out of the pending list (which requires a null adoption date) without
  // entering the adopted list (which requires the adopted status), disappearing
  // from the site entirely.
  const result = db
    .prepare(
      `
    UPDATE ordinances
    SET adopted_date = (
      SELECT m.date
      FROM ordinance_meetings om
      JOIN meetings m ON m.id = om.meeting_id
      WHERE om.ordinance_id = ordinances.id
        AND om.action = 'adopted'
        AND om.outcome_verified = 1
      ORDER BY m.date DESC
      LIMIT 1
    ),
    status = 'adopted',
    updated_at = datetime('now')
    WHERE EXISTS (
      SELECT 1 FROM ordinance_meetings om
      JOIN meetings m ON m.id = om.meeting_id
      WHERE om.ordinance_id = ordinances.id
        AND om.action = 'adopted'
        AND om.outcome_verified = 1
    )
  `
    )
    .run();

  console.log(
    `Updated ${result.changes} ordinance adoption dates from meeting dates`
  );
  return result.changes;
}

// Extract resolutions from agenda items and store in resolutions table
export function extractResolutionsFromAgendaItems(meetingId?: string): number {
  const db = getDb();

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

  const resolutionItems = (
    meetingId ? db.prepare(query).all(meetingId) : db.prepare(query).all()
  ) as Array<{
    reference_number: string;
    title: string;
    outcome: string | null;
    meeting_date: string;
    meeting_id: string;
    packet_url: string | null;
  }>;

  const resolutionMap = new Map<
    string,
    {
      number: string;
      title: string;
      status: string;
      introducedDate: string;
      adoptedDate: string | null;
      meetingId: string;
      packetUrl: string | null;
    }
  >();

  for (const item of resolutionItems) {
    const existing = resolutionMap.get(item.reference_number);

    let cleanTitle = item.title
      .replace(/^Consider\s+Resolution\s+[\d-]+\s*/i, '')
      .replace(/^to\s+/i, '')
      .trim();

    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

    // Check if meeting is in the future - can't be adopted yet
    const today = new Date().toISOString().split('T')[0];
    const isFutureMeeting = item.meeting_date > today;

    // Determine status based on available data
    // - Future meeting → 'proposed' (hasn't happened yet)
    // - Past meeting without outcome → 'pending_minutes' (need to verify from minutes)
    // - Past meeting with explicit outcome → use that outcome
    let status: string;
    if (isFutureMeeting) {
      status = 'proposed';
    } else if (item.outcome) {
      // We have an explicit outcome from the agenda item
      const outcomeLower = item.outcome.toLowerCase();
      if (
        outcomeLower.includes('approved') ||
        outcomeLower.includes('adopted') ||
        outcomeLower.includes('passed')
      ) {
        status = 'adopted';
      } else if (
        outcomeLower.includes('rejected') ||
        outcomeLower.includes('denied')
      ) {
        status = 'rejected';
      } else if (outcomeLower.includes('tabled')) {
        status = 'tabled';
      } else {
        // Unknown outcome format - mark as pending verification
        status = 'pending_minutes';
      }
    } else {
      // Past meeting but no outcome data - needs verification from minutes
      status = 'pending_minutes';
    }

    if (!existing) {
      resolutionMap.set(item.reference_number, {
        number: item.reference_number,
        title: cleanTitle || item.title,
        status,
        introducedDate: item.meeting_date,
        // Only set adoptedDate if status is 'adopted' (verified from explicit outcome)
        adoptedDate: status === 'adopted' ? item.meeting_date : null,
        meetingId: item.meeting_id,
        packetUrl: item.packet_url,
      });
    } else {
      // Only update to adopted if we have explicit verification
      if (status === 'adopted' && !existing.adoptedDate) {
        existing.adoptedDate = item.meeting_date;
        existing.status = 'adopted';
      }
      // Update introduced date if we found an earlier mention
      if (item.meeting_date < existing.introducedDate) {
        existing.introducedDate = item.meeting_date;
      }
    }
  }

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
