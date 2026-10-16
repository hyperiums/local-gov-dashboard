// CivicClerk portal scraping - meetings, agendas, minutes, resolutions
import { DATA_SOURCES } from '../types';
import { cityAddress } from '../city-config-client';
import { extractAgendaItemsFromPdf } from '../summarize';
import { extractOrdinanceNumbers, extractResolutionNumbers } from '../ordinanceRefs';
import {
  ScrapedMeeting,
  ScrapedAgendaItem,
  getMonthNumber,
  fetchPdf,
} from './utils';

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
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
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
            title: pageTitle.includes('Council')
              ? 'City Council Meeting'
              : 'City Meeting',
            type: 'city_council',
            location: cityAddress,
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
        location: cityAddress,
        civicClerkEventId: eventId,
        agendaUrl: url,
        packetUrl: url,
      };
    }

    // Parse agenda items from rendered content
    const agendaItems: ScrapedAgendaItem[] = [];
    const lines = bodyText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);
    let orderNum = 0;

    // Track seen items to avoid duplicates
    const seenItems = new Set<string>();

    for (const line of lines) {
      let title: string | null = null;

      // Pattern 1: Letter prefix (a., b., A., B.)
      const letterMatch = line.match(/^([a-z])\.\s+(.+)/i);
      if (letterMatch) {
        title = letterMatch[2].trim();
      }

      // Pattern 2: Numbered items (1., 2., 1), 2))
      if (!title) {
        const numberMatch = line.match(/^(\d+)[.)]\s+(.+)/);
        if (numberMatch) {
          title = numberMatch[2].trim();
        }
      }

      // Pattern 3: Bullet points (•, ●, ■, -, *)
      if (!title) {
        const bulletMatch = line.match(/^[•●■\-*]\s+(.+)/);
        if (bulletMatch) {
          title = bulletMatch[1].trim();
        }
      }

      // Pattern 4: Roman numerals (I., II., III., IV., V.)
      if (!title) {
        const romanMatch = line.match(
          /^(I{1,3}|IV|V|VI{0,3}|IX|X)\.\s+(.+)/i
        );
        if (romanMatch) {
          title = romanMatch[2].trim();
        }
      }

      // Pattern 5: Keyword-based detection for substantive items without prefixes
      if (!title && line.length > 20 && line.length < 500) {
        const keywordMatch = line.match(
          /^(Consider|Resolution|Ordinance|Public\s+Hearing|Approve|Discussion|Report|Motion|Presentation)\b\s*(.+)?/i
        );
        if (keywordMatch) {
          title = line;
        }
      }

      if (!title) continue;

      // Skip duplicates and non-substantive items
      const titleKey = title.toLowerCase();
      if (seenItems.has(titleKey)) continue;
      if (title === 'No Attachment File') continue;
      if (title.length < 10) continue;

      seenItems.add(titleKey);
      orderNum++;

      // Detect type from title
      let type = 'other';
      let referenceNumber: string | undefined;
      // A single item often carries several numbers ("Ordinances 702-A and
      // 715-A"), so every one is kept for linking while the first fills the
      // single-value reference_number column.
      let referenceNumbers: string[] = [];

      if (title.toLowerCase().includes('ordinance')) {
        type = 'ordinance';
        referenceNumbers = extractOrdinanceNumbers(title);
        referenceNumber = referenceNumbers[0];
      } else if (title.toLowerCase().includes('resolution')) {
        type = 'resolution';
        referenceNumbers = extractResolutionNumbers(title);
        referenceNumber = referenceNumbers[0];
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
        referenceNumbers,
        attachments: [],
      });
    }

    // If no items found from sidebar, try extracting from PDF with OpenAI
    // This handles older meetings (pre-Sept 2025) where CivicClerk doesn't show itemized agendas
    if (agendaItems.length === 0) {
      console.log(
        `Event ${eventId}: No sidebar items, attempting PDF extraction with AI...`
      );
      try {
        // Close the current browser first to free resources before launching PDF fetch
        await browser.close();
        browser = undefined;

        const pdfBase64 = await fetchCivicClerkAgendaPdf(eventId);
        if (pdfBase64) {
          const extracted = await extractAgendaItemsFromPdf(pdfBase64);
          for (const item of extracted) {
            agendaItems.push({
              orderNum: item.orderNum,
              title: item.title,
              type: item.type,
              referenceNumber: item.referenceNumber,
              attachments: [],
            });
          }
          console.log(
            `Event ${eventId}: Extracted ${agendaItems.length} items from PDF with AI`
          );
        } else {
          console.log(`Event ${eventId}: Could not fetch agenda PDF`);
        }
      } catch (error) {
        console.error(`Event ${eventId}: PDF extraction failed:`, error);
      }
    } else {
      console.log(
        `Event ${eventId}: Found ${agendaItems.length} agenda items from sidebar`
      );
    }

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

// Dynamically discover valid CivicClerk event IDs using Playwright
export async function discoverCivicClerkEventIds(): Promise<number[]> {
  const validIds: number[] = [];
  const baseUrl = DATA_SOURCES.civicClerk.baseUrl;

  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
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
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight)
      );
      await page.waitForTimeout(500);
    }

    // Extract all event IDs from links
    const eventLinks = await page.$$eval('a[href*="/event/"]', (links) => {
      return links
        .map((link) => {
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
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return validIds.sort((a, b) => a - b);
}

// Get the direct PDF URL for a CivicClerk event's agenda
export async function getCivicClerkAgendaPdfUrl(
  eventId: number
): Promise<string | null> {
  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    const eventUrl = `${DATA_SOURCES.civicClerk.baseUrl}/event/${eventId}/files`;
    console.log(`Navigating to ${eventUrl}...`);
    await page.goto(eventUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Extract the PDF URL from the iframe src
    const pdfUrl = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="pdfjs"]');
      if (!iframe) {
        const allIframes = document.querySelectorAll('iframe');
        console.log(
          'No pdfjs iframe found. Total iframes:',
          allIframes.length
        );
        allIframes.forEach((f, i) =>
          console.log(`iframe ${i}:`, f.src?.substring(0, 100))
        );
        return null;
      }

      const src = iframe.getAttribute('src') || '';
      const fileMatch = src.match(/file=([^&]+)/);
      if (!fileMatch) {
        console.log(
          'No file param found in iframe src:',
          src.substring(0, 200)
        );
        return null;
      }

      return decodeURIComponent(fileMatch[1]);
    });

    console.log(
      `PDF URL for event ${eventId}:`,
      pdfUrl ? pdfUrl.substring(0, 100) + '...' : 'NOT FOUND'
    );
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
export async function fetchCivicClerkAgendaPdf(
  eventId: number
): Promise<string | null> {
  const pdfUrl = await getCivicClerkAgendaPdfUrl(eventId);
  if (!pdfUrl) return null;

  try {
    const buffer = await fetchPdf(pdfUrl);
    return buffer.toString('base64');
  } catch (error) {
    console.error('Error fetching agenda PDF:', error);
    return null;
  }
}

// Get the direct PDF URL for a CivicClerk event's minutes
export async function getCivicClerkMinutesPdfUrl(
  eventId: number
): Promise<string | null> {
  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
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
      const items = document.querySelectorAll(
        'li.MuiListItem-container button'
      );
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

    console.log(
      `Minutes PDF URL for event ${eventId}:`,
      pdfUrl ? pdfUrl.substring(0, 100) + '...' : 'NOT FOUND'
    );
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
export async function fetchCivicClerkMinutesPdf(
  eventId: number
): Promise<string | null> {
  const pdfUrl = await getCivicClerkMinutesPdfUrl(eventId);
  if (!pdfUrl) return null;

  try {
    const buffer = await fetchPdf(pdfUrl);
    return buffer.toString('base64');
  } catch (error) {
    console.error('Error fetching minutes PDF:', error);
    return null;
  }
}

// Fetch a specific ordinance attachment PDF from a CivicClerk meeting's file sidebar
// Ordinance PDFs appear as individual attachments grouped under their agenda item header
export async function fetchCivicClerkOrdinanceAttachment(
  eventId: number,
  ordinanceNumber: string
): Promise<string | null> {
  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    const eventUrl = `${DATA_SOURCES.civicClerk.baseUrl}/event/${eventId}/files`;
    await page.goto(eventUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Find and click the ordinance attachment in the sidebar
    // Attachments have text like "Ordinance 774 Annexation 4651..."
    const clicked = await page.evaluate((ordNum) => {
      const items = document.querySelectorAll(
        'li.MuiListItem-container'
      );
      for (const item of items) {
        const textSpan = item.querySelector('.MuiListItemText-primary');
        const text = textSpan?.textContent?.trim() || '';
        // Match "Ordinance {number}" at the start of the attachment name
        if (text.match(new RegExp(`^Ordinance\\s+${ordNum}\\b`, 'i'))) {
          const button = item.querySelector('button, [role="button"]');
          if (button) {
            (button as HTMLElement).click();
            return text;
          }
        }
      }
      return null;
    }, ordinanceNumber);

    if (!clicked) {
      console.log(`No attachment found for Ordinance ${ordinanceNumber} in event ${eventId}`);
      return null;
    }

    console.log(`Clicked attachment: "${clicked}"`);
    await page.waitForTimeout(2000);

    // Extract the PDF URL from the iframe viewer
    const pdfUrl = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[src*="pdfjs"]');
      if (!iframe) return null;
      const src = iframe.getAttribute('src') || '';
      const fileMatch = src.match(/file=([^&]+)/);
      return fileMatch ? decodeURIComponent(fileMatch[1]) : null;
    });

    if (!pdfUrl) {
      console.log(`No PDF URL found after clicking Ordinance ${ordinanceNumber} attachment`);
      return null;
    }

    const buffer = await fetchPdf(pdfUrl);
    return buffer.toString('base64');
  } catch (error) {
    console.error(`Failed to fetch Ordinance ${ordinanceNumber} attachment from event ${eventId}:`, error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Fetch multiple ordinance attachments from a single browser session to avoid repeated launches
export async function fetchCivicClerkOrdinanceAttachments(
  eventId: number,
  ordinanceNumbers: string[]
): Promise<Map<string, string>> {
  const { chromium } = await import('playwright');
  const results = new Map<string, string>();

  if (ordinanceNumbers.length === 0) return results;

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    const eventUrl = `${DATA_SOURCES.civicClerk.baseUrl}/event/${eventId}/files`;
    await page.goto(eventUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    for (const ordinanceNumber of ordinanceNumbers) {
      try {
        const clicked = await page.evaluate((ordNum) => {
          const items = document.querySelectorAll('li.MuiListItem-container');
          for (const item of items) {
            const textSpan = item.querySelector('.MuiListItemText-primary');
            const text = textSpan?.textContent?.trim() || '';
            if (text.match(new RegExp(`^Ordinance\\s+${ordNum}\\b`, 'i'))) {
              const button = item.querySelector('button, [role="button"]');
              if (button) {
                (button as HTMLElement).click();
                return text;
              }
            }
          }
          return null;
        }, ordinanceNumber);

        if (!clicked) {
          console.log(`  No attachment for Ordinance ${ordinanceNumber}`);
          continue;
        }

        await page.waitForTimeout(2000);

        const pdfUrl = await page.evaluate(() => {
          const iframe = document.querySelector('iframe[src*="pdfjs"]');
          if (!iframe) return null;
          const src = iframe.getAttribute('src') || '';
          const fileMatch = src.match(/file=([^&]+)/);
          return fileMatch ? decodeURIComponent(fileMatch[1]) : null;
        });

        if (pdfUrl) {
          const buffer = await fetchPdf(pdfUrl);
          results.set(ordinanceNumber, buffer.toString('base64'));
          console.log(`  Fetched PDF for Ordinance ${ordinanceNumber}`);
        }
      } catch (error) {
        console.error(`  Failed to fetch Ordinance ${ordinanceNumber}:`, error);
      }
    }

    return results;
  } catch (error) {
    console.error(`Failed to fetch ordinance attachments from event ${eventId}:`, error);
    return results;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Vote outcome from overview page
export interface VoteOutcome {
  itemTitle: string;
  motion: string;
  result: 'passed' | 'failed' | 'tabled';
  initiatedBy: string;
  secondedBy: string;
  yesCount: number;
  noCount: number;
  abstainCount: number;
  yesVotes: string[];
  noVotes: string[];
  abstainVotes: string[];
}

export interface ParsedVoteModal {
  motion: string;
  result: string;
  initiatedBy: string;
  secondedBy: string;
  yesCount: number;
  noCount: number;
  abstainCount: number;
  voters: string[];
}

/**
 * Parse the text of a CivicClerk "Motions/Votes Detail" modal.
 *
 * One agenda item can carry several motions. Council routinely takes a motion
 * that fails and then another that carries — the Hemingway fencing item on
 * June 18, 2026 reads "Motion: Advance / Failed, Motion: Advance / Passed".
 * The operative outcome is the last motion recorded, so scanning the blob for
 * the first Passed|Failed reported the abandoned motion and would have
 * published ordinances that are still moving as having failed.
 */
export function parseVoteModal(modalText: string): ParsedVoteModal | { debug: string; error: string } {
  // Each motion owns the text up to the next "Motion:", so a motion with no
  // recorded result cannot borrow the following motion's result.
  const motionPairs = [
    ...modalText.matchAll(/Motion:\s*(\w+)(?:(?!Motion:)[\s\S])*?\b(Passed|Failed|Tabled)\b/gi),
  ];
  const decisive = motionPairs.length > 0 ? motionPairs[motionPairs.length - 1] : null;
  const firstMotion = modalText.match(/Motion:\s*(\w+)/i);

  const initiatedMatch = modalText.match(/Initiated by\s+([^,]+)/i);
  const secondedMatch = modalText.match(/seconded by\s+([^.\n\d]+)/i);
  const yesMatch = modalText.match(/Yes\s*(\d+)/i);
  const noMatch = modalText.match(/No\s+(\d+)/i);
  const abstainMatch = modalText.match(/Abstain\s*(\d+)/i);
  const voterLines = modalText.match(/\d+\.\s+[A-Z][a-z]+\s+[A-Z][a-zA-Z]+/g) || [];
  const voters = voterLines.map(v => v.replace(/^\d+\.\s*/, '').trim());

  const common = {
    initiatedBy: initiatedMatch?.[1]?.trim() || 'Unknown',
    secondedBy: secondedMatch?.[1]?.trim() || 'Unknown',
    yesCount: parseInt(yesMatch?.[1] || '0'),
    noCount: parseInt(noMatch?.[1] || '0'),
    abstainCount: parseInt(abstainMatch?.[1] || '0'),
    voters,
  };

  if (!decisive) {
    // A motion to deny with no recorded result is how the portal represents a
    // denial that carried.
    if (firstMotion?.[1]?.toLowerCase() === 'deny') {
      return { motion: 'Deny', result: 'passed', ...common };
    }
    return { debug: modalText.slice(0, 300), error: 'No result match' };
  }

  return { motion: decisive[1], result: decisive[2].toLowerCase(), ...common };
}

// Fetch vote outcomes from the overview page (more reliable than PDF parsing)
export async function fetchVoteOutcomesFromOverview(
  eventId: number
): Promise<VoteOutcome[]> {
  const { chromium } = await import('playwright');
  const outcomes: VoteOutcome[] = [];

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    const overviewUrl = `${DATA_SOURCES.civicClerk.baseUrl}/event/${eventId}/overview`;
    console.log(`Fetching vote outcomes from ${overviewUrl}...`);
    await page.goto(overviewUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for page content to load (look for Meeting Overview text)
    await page.waitForSelector('text=Meeting Overview', { timeout: 10000 });

    // Expand all collapsed sections first
    const expandButtons = await page.$$('[aria-expanded="false"]');
    for (const btn of expandButtons) {
      try {
        await btn.click();
        // Wait for expansion animation
        await page.waitForFunction(
          (el) => el.getAttribute('aria-expanded') === 'true',
          btn,
          { timeout: 2000 }
        ).catch(() => {});
      } catch {
        // Ignore click errors
      }
    }

    // Find all items with MOTIONS/VOTES buttons and their associated text
    const itemsWithVotes = await page.evaluate(() => {
      const results: { itemText: string; buttonIndex: number }[] = [];
      const allElements = Array.from(document.querySelectorAll('*'));
      let buttonIndex = 0;

      for (const el of allElements) {
        const htmlEl = el as HTMLElement;
        if (
          htmlEl.innerText === 'MOTIONS / VOTES' ||
          el.textContent?.trim() === 'MOTIONS / VOTES'
        ) {
          // Find parent to get context
          let parent = el.parentElement as HTMLElement | null;
          for (let i = 0; i < 8; i++) {
            if (!parent) break;
            const text = parent.innerText || parent.textContent || '';
            if (text.length > 50 && text.length < 800) {
              // Zoning items put the ordinance reference at the very end
              // ("...Sterling on the Lake, Pursuant to Ordinance 239-N /
              // 240-N." runs 227 characters). A 200-character cap dropped that
              // reference, so the adoption vote matched no ordinance and the
              // item stayed "pending" long after council passed it.
              const itemText = text
                .replace(/MOTIONS \/ VOTES/g, '')
                .trim()
                .slice(0, 600);
              results.push({ itemText, buttonIndex });
              break;
            }
            parent = parent.parentElement;
          }
          buttonIndex++;
        }
      }
      return results;
    });

    console.log(`Found ${itemsWithVotes.length} items with vote buttons`);

    // Read the raw modal text out of the page and parse it here, so the parsing
    // rules are ordinary testable code rather than a regex sealed inside the
    // browser context.
    const extractVoteData = async () => {
      const modalText = await page.evaluate(() => {
        const modalMatch = document.body.innerText.match(/Motions\/Votes Detail[\s\S]{0,800}/);
        return modalMatch ? modalMatch[0] : '';
      });
      return parseVoteModal(modalText);
    };

    // Helper to close modal
    const closeModal = async () => {
      await page.keyboard.press('Escape');
      await page.waitForFunction(
        () => !document.body.innerText.includes('Motions/Votes Detail'),
        { timeout: 3000 }
      ).catch(() => {});
      // Small delay after closing to let page stabilize
      await new Promise(r => setTimeout(r, 300));
    };

    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;

    // Click each MOTIONS/VOTES button and extract vote data
    for (const item of itemsWithVotes) {
      const MAX_RETRIES = 3;
      let extracted = false;

      for (let attempt = 1; attempt <= MAX_RETRIES && !extracted; attempt++) {
        try {
          if (attempt > 1) {
            console.log(`    Retry attempt ${attempt}/${MAX_RETRIES}...`);
            // Wait longer between retries
            await new Promise(r => setTimeout(r, 500 * attempt));
          }

          console.log(`  Processing item ${item.buttonIndex}: ${item.itemText.slice(0, 50)}...`);

          // Find and click the button
          const clicked = await page.evaluate((idx) => {
            const allElements = Array.from(document.querySelectorAll('*'));
            let buttonIndex = 0;
            for (const el of allElements) {
              const htmlEl = el as HTMLElement;
              if (
                htmlEl.innerText === 'MOTIONS / VOTES' ||
                el.textContent?.trim() === 'MOTIONS / VOTES'
              ) {
                if (buttonIndex === idx) {
                  htmlEl.click();
                  return true;
                }
                buttonIndex++;
              }
            }
            return false;
          }, item.buttonIndex);

          if (!clicked) {
            console.log(`    Failed to click button`);
            continue;
          }
          console.log(`    Button clicked`);

          // Wait for modal with vote result (increased timeout)
          try {
            await page.waitForFunction(
              () => {
                const text = document.body.innerText;
                return text.includes('Motions/Votes Detail') &&
                       (text.includes('Passed') || text.includes('Failed') || text.includes('Tabled') ||
                        /Motion:\s*Deny/i.test(text));
              },
              { timeout: 8000 }
            );
          } catch {
            console.log(`    Modal did not appear or has no vote result (timeout)`);
            await closeModal();
            continue;
          }
          console.log(`    Modal appeared with vote result`);

          // Small delay to ensure modal content is fully rendered
          await new Promise(r => setTimeout(r, 200));

          // Extract vote data
          const voteData = await extractVoteData();

          if ('result' in voteData && voteData.result && voteData.result !== 'unknown') {
            console.log(`    Extracted: ${voteData.result} (${voteData.yesCount}-${voteData.noCount})`);
            outcomes.push({
              itemTitle: item.itemText,
              motion: voteData.motion,
              result: voteData.result as 'passed' | 'failed' | 'tabled',
              initiatedBy: voteData.initiatedBy,
              secondedBy: voteData.secondedBy,
              yesCount: voteData.yesCount,
              noCount: voteData.noCount,
              abstainCount: voteData.abstainCount,
              yesVotes: voteData.voters || [],
              noVotes: [],
              abstainVotes: [],
            });
            extracted = true;
            consecutiveFailures = 0;
          } else if ('debug' in voteData && voteData.debug) {
            console.log(`    Debug modal text: ${voteData.debug}`);
          } else {
            console.log(`    No vote data extracted`);
          }

          await closeModal();
        } catch (error) {
          console.error(`    Error on attempt ${attempt}:`, error);
          await closeModal();
        }
      }

      if (!extracted) {
        consecutiveFailures++;
        console.log(`    Failed to extract vote after ${MAX_RETRIES} attempts`);

        // If too many consecutive failures, refresh the page and re-expand sections
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.log(`    Too many failures, refreshing page...`);
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForSelector('text=Meeting Overview', { timeout: 10000 });

          // Re-expand collapsed sections
          const expandButtons = await page.$$('[aria-expanded="false"]');
          for (const btn of expandButtons) {
            try {
              await btn.click();
              await page.waitForFunction(
                (el) => el.getAttribute('aria-expanded') === 'true',
                btn,
                { timeout: 2000 }
              ).catch(() => {});
            } catch {
              // Ignore
            }
          }

          consecutiveFailures = 0;
          console.log(`    Page refreshed, continuing...`);
        }
      }
    }

    console.log(`Extracted ${outcomes.length} vote outcomes`);
    return outcomes;
  } catch (error) {
    console.error(`Failed to fetch vote outcomes for event ${eventId}:`, error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Check if a meeting has vote data available on the overview page
export async function hasVoteDataAvailable(eventId: number): Promise<boolean> {
  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    const overviewUrl = `${DATA_SOURCES.civicClerk.baseUrl}/event/${eventId}/overview`;
    await page.goto(overviewUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for page content to load
    await page.waitForSelector('text=Meeting Overview', { timeout: 10000 });

    // Check if there are any MOTIONS/VOTES buttons
    const hasVotes = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      return allElements.some(
        (el) =>
          (el as HTMLElement).innerText === 'MOTIONS / VOTES' ||
          el.textContent?.trim() === 'MOTIONS / VOTES'
      );
    });

    return hasVotes;
  } catch (error) {
    console.error(`Failed to check vote data for event ${eventId}:`, error);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
