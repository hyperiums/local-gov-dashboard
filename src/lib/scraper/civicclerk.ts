// CivicClerk portal scraping - meetings, agendas, minutes, resolutions
import { DATA_SOURCES } from '../types';
import { extractAgendaItemsFromPdf } from '../summarize';
import {
  ScrapedMeeting,
  ScrapedAgendaItem,
  getMonthNumber,
  fetchPdf,
} from './utils';

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

      if (title.toLowerCase().includes('ordinance')) {
        type = 'ordinance';
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

// Scrape all meetings from CivicClerk portal using Playwright
export async function scrapeCivicClerkMeetingsWithPlaywright(options?: {
  minYear?: number;
}): Promise<CivicClerkMeeting[]> {
  const meetings: CivicClerkMeeting[] = [];
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

    // First, get all event IDs from the main page
    console.log('Navigating to CivicClerk portal...');
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Use calendar navigation to load historical meetings if minYear is specified
    if (options?.minYear) {
      const currentYear = new Date().getFullYear();
      const monthsToGoBack =
        (currentYear - options.minYear) * 12 + new Date().getMonth();

      if (monthsToGoBack > 0) {
        console.log(
          `Navigating calendar back to ${options.minYear} (${monthsToGoBack} months)...`
        );

        // Try to click the month/year header to open the picker
        try {
          const monthYearSelector = 'button[aria-label*="month"], [class*="month-year"], .MuiPickersCalendarHeader-switchViewButton';
          const monthYearButton = await page.$(monthYearSelector);
          if (monthYearButton) {
            await monthYearButton.click();
            await page.waitForTimeout(500);
          }
        } catch (e) {
          console.log('Could not open month picker, continuing with scroll navigation');
        }

        // Navigate backwards month by month
        // Use page.evaluate() to click elements directly in the DOM to avoid stale element handles
        let navigatedMonths = 0;
        const maxAttempts = Math.min(monthsToGoBack, 36);

        for (let i = 0; i < maxAttempts; i++) {
          const clicked = await page.evaluate(() => {
            // Find navigation buttons - look for left/previous arrows
            const selectors = [
              'button[aria-label*="previous"]',
              'button[aria-label*="Previous"]',
              '[class*="prev"] button',
              'button svg[data-testid="NavigateBeforeIcon"]',
              'button svg[data-testid="ArrowLeftIcon"]',
            ];

            for (const selector of selectors) {
              const btn = document.querySelector(selector);
              if (btn) {
                // Get the clickable button (might be parent of svg)
                const clickTarget = btn.closest('button') || btn;
                (clickTarget as HTMLElement).click();
                return true;
              }
            }

            // Fallback: find any left-positioned button with an SVG in a calendar context
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const btn of buttons) {
              const svg = btn.querySelector('svg');
              if (svg && btn.closest('[class*="calendar"], [class*="picker"], [class*="Calendar"]')) {
                const rect = btn.getBoundingClientRect();
                if (rect.x < 200 && rect.width < 60) { // Left side, small button
                  (btn as HTMLElement).click();
                  return true;
                }
              }
            }
            return false;
          });

          if (!clicked) {
            console.log(`Could not find previous button after ${navigatedMonths} months`);
            break;
          }

          navigatedMonths++;
          // Wait for React to re-render the calendar - use longer wait for stability
          await page.waitForTimeout(500);

          // Every 6 months, log progress
          if (navigatedMonths % 6 === 0) {
            console.log(`  Navigated back ${navigatedMonths} months...`);
          }
        }

        // Try to click on the target year if a year picker is visible
        await page.evaluate((year) => {
          const yearButtons = Array.from(document.querySelectorAll('button'));
          for (const btn of yearButtons) {
            if (btn.textContent?.trim() === String(year)) {
              (btn as HTMLElement).click();
              return;
            }
          }
        }, options.minYear);

        await page.waitForTimeout(1000);
        console.log(`Calendar navigation complete: navigated ${navigatedMonths} months`);
      }
    }

    console.log('Loading events...');

    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(1000);

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight)
      );
      await page.waitForTimeout(300);
    }

    const eventIds = await page.$$eval('a[href*="/event/"]', (links) => {
      const ids = new Set<number>();
      links.forEach((link) => {
        const href = (link as HTMLAnchorElement).href;
        const match = href.match(/\/event\/(\d+)/);
        if (match) ids.add(parseInt(match[1]));
      });
      // Sort descending - higher event IDs are typically newer meetings
      return Array.from(ids).sort((a, b) => b - a);
    });

    console.log(`Found ${eventIds.length} unique event IDs, fetching details (newest first)...`);

    let consecutiveSkips = 0;
    const maxConsecutiveSkips = 30;

    for (const eventId of eventIds) {
      if (options?.minYear && consecutiveSkips >= maxConsecutiveSkips) {
        console.log(
          `Stopping early: ${consecutiveSkips} consecutive events older than ${options.minYear}`
        );
        break;
      }

      try {
        const eventUrl = `${baseUrl}/event/${eventId}/files`;
        await page.goto(eventUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await page.waitForTimeout(1500);

        const pageTitle = await page.title();
        const headerText = await page.evaluate(() => {
          const h1 = document.querySelector('h1, [class*="title"], header');
          return h1?.textContent || document.title || '';
        });

        const combinedText = `${pageTitle} ${headerText}`;

        const dateMatch = combinedText.match(
          /([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})/
        );
        let dateStr = '';
        if (dateMatch) {
          const monthNames: Record<string, string> = {
            january: '01',
            february: '02',
            march: '03',
            april: '04',
            may: '05',
            june: '06',
            july: '07',
            august: '08',
            september: '09',
            october: '10',
            november: '11',
            december: '12',
          };
          const month = monthNames[dateMatch[1].toLowerCase()] || '01';
          const day = dateMatch[2].padStart(2, '0');
          const year = dateMatch[3];
          dateStr = `${year}-${month}-${day}`;
        }

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

        // Check if there's an actual Minutes document in the sidebar
        // Use the same selector as getCivicClerkMinutesPdfUrl for consistency
        const hasMinutes = await page.evaluate(() => {
          // Look for sidebar list items with a primary text span containing exactly "Minutes"
          const items = document.querySelectorAll('li.MuiListItem-container');
          for (const item of items) {
            const textSpan = item.querySelector('.MuiListItemText-primary');
            if (textSpan?.textContent?.trim() === 'Minutes') {
              return true;
            }
          }
          return false;
        });

        if (dateStr) {
          const meetingYear = parseInt(dateStr.substring(0, 4));
          if (options?.minYear && meetingYear < options.minYear) {
            console.log(
              `  Event ${eventId}: Skipping (${meetingYear} < minYear ${options.minYear})`
            );
            consecutiveSkips++;
          } else {
            meetings.push({
              eventId,
              date: dateStr,
              title,
              location: '5410 Pine Street, Flowery Branch, GA 30542',
              type,
              agendaUrl: eventUrl,
              minutesUrl: hasMinutes
                ? `${baseUrl}/event/${eventId}/files`
                : undefined,
              mediaUrl: `${baseUrl}/event/${eventId}/media`,
            });
            console.log(`  Event ${eventId}: ${title} on ${dateStr}`);
            consecutiveSkips = 0;
          }
        } else {
          console.log(
            `  Event ${eventId}: Could not parse date from "${combinedText.substring(0, 100)}"`
          );
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

  return meetings.sort((a, b) => b.date.localeCompare(a.date));
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
        if (
          el.innerText === 'MOTIONS / VOTES' ||
          el.textContent?.trim() === 'MOTIONS / VOTES'
        ) {
          // Find parent to get context
          let parent = el.parentElement;
          for (let i = 0; i < 8; i++) {
            if (!parent) break;
            const text = parent.innerText || parent.textContent || '';
            if (text.length > 50 && text.length < 800) {
              const itemText = text
                .replace(/MOTIONS \/ VOTES/g, '')
                .trim()
                .slice(0, 200);
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

    // Click each MOTIONS/VOTES button and extract vote data
    for (const item of itemsWithVotes) {
      try {
        console.log(`  Processing item ${item.buttonIndex}: ${item.itemText.slice(0, 50)}...`);

        // Find and click the button
        const clicked = await page.evaluate((idx) => {
          const allElements = Array.from(document.querySelectorAll('*'));
          let buttonIndex = 0;
          for (const el of allElements) {
            if (
              el.innerText === 'MOTIONS / VOTES' ||
              el.textContent?.trim() === 'MOTIONS / VOTES'
            ) {
              if (buttonIndex === idx) {
                (el as HTMLElement).click();
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
        console.log(`    Button clicked`)

        // Wait for modal with vote result to fully load (not just the header)
        try {
          await page.waitForFunction(
            () => {
              const text = document.body.innerText;
              // Wait for the actual vote result, not just the modal header
              return text.includes('Motions/Votes Detail') &&
                     (text.includes('Passed') || text.includes('Failed') || text.includes('Tabled'));
            },
            { timeout: 5000 }
          );
        } catch {
          console.log(`    Modal did not appear or has no vote result (timeout)`);
          continue;
        }
        console.log(`    Modal appeared with vote result`);

        // Extract vote data from modal
        const voteData = await page.evaluate(() => {
          // Look for the modal content more broadly
          const bodyText = document.body.innerText;

          // Debug: find the modal text
          const modalMatch = bodyText.match(/Motions\/Votes Detail[\s\S]{0,800}/);
          const modalText = modalMatch ? modalMatch[0] : '';

          // Parse motion and result from modal text specifically
          const motionMatch = modalText.match(/Motion:\s*(\w+)/i);
          const resultMatch = modalText.match(/(Passed|Failed|Tabled)/i);
          const initiatedMatch = modalText.match(/Initiated by\s+([^,]+)/i);
          const secondedMatch = modalText.match(/seconded by\s+([^.\n\d]+)/i);

          // Parse vote counts
          const yesMatch = modalText.match(/Yes\s*(\d+)/i);
          const noMatch = modalText.match(/No\s+(\d+)/i);
          const abstainMatch = modalText.match(/Abstain\s*(\d+)/i);

          // Parse individual votes (numbered list)
          const voterLines = modalText.match(/\d+\.\s+[A-Z][a-z]+\s+[A-Z][a-zA-Z]+/g) || [];
          const voters = voterLines.map(v => v.replace(/^\d+\.\s*/, '').trim());

          if (!resultMatch) {
            return { debug: modalText.slice(0, 300), error: 'No result match' };
          }

          return {
            motion: motionMatch?.[1] || 'Unknown',
            result: resultMatch?.[1]?.toLowerCase() || 'unknown',
            initiatedBy: initiatedMatch?.[1]?.trim() || 'Unknown',
            secondedBy: secondedMatch?.[1]?.trim() || 'Unknown',
            yesCount: parseInt(yesMatch?.[1] || '0'),
            noCount: parseInt(noMatch?.[1] || '0'),
            abstainCount: parseInt(abstainMatch?.[1] || '0'),
            voters,
          };
        });

        if (voteData && voteData.result && voteData.result !== 'unknown' && !voteData.error) {
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
        } else if (voteData?.debug) {
          console.log(`    Debug modal text: ${voteData.debug}`);
        } else {
          console.log(`    No vote data extracted`);
        }

        // Close modal by pressing Escape and wait for it to close
        await page.keyboard.press('Escape');
        await page.waitForFunction(
          () => !document.body.innerText.includes('Motions/Votes Detail'),
          { timeout: 2000 }
        ).catch(() => {});
      } catch (error) {
        console.error(`Error extracting vote for item: ${item.itemText}`, error);
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
          el.innerText === 'MOTIONS / VOTES' ||
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
