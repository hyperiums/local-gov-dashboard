// Municode ordinance scraping
import { municodeUrl, cityConfig } from '../city-config-client';

export interface ScrapedOrdinance {
  number: string;
  year: string;
  title: string;
  municodeUrl: string;
  nodeId: string;
  pdfUrl: string;
}

// Supplement History entry - tracks whether ordinances are codified or omitted
export interface SupplementHistoryEntry {
  ordinanceNumber: string;
  adoptedDate: string;  // From supplement table
  disposition: 'codified' | 'omit';
  supplementNumber?: string;
}

// Municode PDF URL pattern - productId loaded from city-config.json
export function getMunicodePdfUrl(nodeId: string): string {
  const productId = cityConfig.urls.municodeProductId;
  return `https://mcclibraryfunctions.azurewebsites.us/api/ordinanceDownload/${productId}/${nodeId}/pdf`;
}

// Scrape Municode ordinances using Playwright (headless browser)
// This approach works reliably because Municode is a React SPA with authenticated APIs
export async function scrapeMunicodeOrdinances(
  years?: string[]
): Promise<ScrapedOrdinance[]> {
  const ordinances: ScrapedOrdinance[] = [];
  const baseUrl = `${municodeUrl}/ordinances/code_of_ordinances`;

  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    console.log('Navigating to Municode...');

    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });

    await page.waitForTimeout(3000);

    const title = await page.title();
    console.log('Page title:', title);

    const yearButtons = await page.$$(
      'button, [role="button"], [class*="toggle"], span'
    );
    console.log(`Found ${yearButtons.length} potential clickable elements`);

    const pageContent = await page.content();
    const yearMatches = pageContent.match(/>(20\d{2})</g);
    const foundYears = yearMatches
      ? [...new Set(yearMatches.map((m) => m.slice(1, 5)))]
      : [];
    console.log('Years found in page:', foundYears);

    const targetYears =
      years || foundYears.filter((y) => parseInt(y) >= 2020);
    console.log('Target years:', targetYears);

    for (const year of targetYears) {
      try {
        console.log(`Processing year ${year}...`);

        const yearSelector = `text="${year}"`;
        const yearElement = await page.$(yearSelector);

        if (yearElement) {
          await yearElement.click();
          await page.waitForTimeout(1000);

          const ordLinks = await page.$$eval('a', (links) => {
            return links
              .filter((link) => {
                const text = link.textContent || '';
                const href = link.getAttribute('href') || '';
                return text.includes('Ordinance No.') && href.includes('nodeId');
              })
              .map((link) => ({
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
              const cleanTitle = `Ordinance No. ${ordMatch[1]}`;
              if (!ordinances.some((o) => o.nodeId === nodeId)) {
                ordinances.push({
                  number: ordMatch[1],
                  year,
                  title: cleanTitle,
                  municodeUrl: link.href.startsWith('http')
                    ? link.href
                    : `${baseUrl}?nodeId=${nodeId}`,
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

// Scrape Municode Supplement History table
// This table lists ALL ordinances with their disposition (Include = codified, Omit = not codified)
// URL: https://library.municode.com/ga/flowery_branch/codes/code_of_ordinances?nodeId=SUHITA
export async function scrapeMunicodeSupplementHistory(): Promise<SupplementHistoryEntry[]> {
  const entries: SupplementHistoryEntry[] = [];
  const url = `${municodeUrl}/codes/code_of_ordinances?nodeId=SUHITA`;

  const { chromium } = await import('playwright');

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });
    const page = await context.newPage();

    console.log('Navigating to Municode Supplement History...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // The supplement history is displayed in tables, one per supplement
    // Each table has rows with columns: Ordinance Number, Date, Disposition (Include/Omit)
    const tableData = await page.evaluate(() => {
      const results: Array<{
        ordinanceNumber: string;
        date: string;
        disposition: string;
        supplement: string;
      }> = [];

      // Find all supplement sections
      const tables = document.querySelectorAll('table');

      // Validation: warn if no tables found (HTML structure may have changed)
      if (tables.length === 0) {
        console.warn('Municode scraper: No tables found on supplement history page');
        return results;
      }

      for (const table of tables) {
        // Try to find the supplement number from a preceding header
        let supplementNumber = '';
        const prevEl = table.previousElementSibling;
        if (prevEl) {
          const headerText = prevEl.textContent || '';
          const suppMatch = headerText.match(/Supplement\s+(\d+)/i);
          if (suppMatch) {
            supplementNumber = suppMatch[1];
          }
        }

        const rows = table.querySelectorAll('tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td, th');
          if (cells.length >= 2) {
            const firstCell = cells[0].textContent?.trim() || '';
            const secondCell = cells[1].textContent?.trim() || '';
            const thirdCell = cells.length > 2 ? cells[2].textContent?.trim() : '';

            // Look for ordinance numbers - could be "Ord. No. 701" or just "701"
            const ordMatch = firstCell.match(/(?:Ord\.?\s*(?:No\.?)?\s*)?(\d+[-A-Za-z]*)/i);
            if (ordMatch) {
              // Determine disposition - look for Include/Omit keywords
              const allText = (secondCell + ' ' + thirdCell).toLowerCase();
              let disposition = '';
              if (allText.includes('include')) {
                disposition = 'Include';
              } else if (allText.includes('omit')) {
                disposition = 'Omit';
              }

              // Extract date if present (formats like "1-4-2024" or "Jan 4, 2024")
              const dateMatch = allText.match(/(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})|([a-z]{3,}\s+\d{1,2},?\s+\d{4})/i);
              const date = dateMatch ? dateMatch[0] : secondCell;

              if (disposition) {
                results.push({
                  ordinanceNumber: ordMatch[1],
                  date,
                  disposition,
                  supplement: supplementNumber,
                });
              }
            }
          }
        }
      }

      return results;
    });

    console.log(`Found ${tableData.length} ordinance entries in supplement history`);

    // Validation: warn if HTML structure may have changed
    if (tableData.length === 0) {
      console.warn('Municode scraper: No valid ordinance entries extracted. HTML structure may have changed.');
    }

    // Convert to SupplementHistoryEntry format
    for (const item of tableData) {
      // Parse date to YYYY-MM-DD format
      let adoptedDate = '';
      try {
        // Try parsing various date formats
        const parsed = new Date(item.date);
        if (!isNaN(parsed.getTime())) {
          adoptedDate = parsed.toISOString().split('T')[0];
        }
      } catch {
        // Keep raw date if parsing fails
        adoptedDate = item.date;
      }

      entries.push({
        ordinanceNumber: item.ordinanceNumber,
        adoptedDate,
        disposition: item.disposition.toLowerCase() === 'include' ? 'codified' : 'omit',
        supplementNumber: item.supplement || undefined,
      });
    }

    // Sort by ordinance number descending
    entries.sort((a, b) => parseInt(b.ordinanceNumber) - parseInt(a.ordinanceNumber));

    console.log(`Processed ${entries.length} supplement history entries`);
  } catch (error) {
    console.error('Failed to scrape Municode supplement history:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return entries;
}
