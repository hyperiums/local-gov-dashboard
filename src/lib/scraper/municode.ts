// Municode ordinance scraping
export interface ScrapedOrdinance {
  number: string;
  year: string;
  title: string;
  municodeUrl: string;
  nodeId: string;
  pdfUrl: string;
}

// Municode PDF URL pattern - productId 14328 is Flowery Branch
const MUNICODE_PRODUCT_ID = '14328';

export function getMunicodePdfUrl(nodeId: string): string {
  return `https://mcclibraryfunctions.azurewebsites.us/api/ordinanceDownload/${MUNICODE_PRODUCT_ID}/${nodeId}/pdf`;
}

// Scrape Municode ordinances using Playwright (headless browser)
// This approach works reliably because Municode is a React SPA with authenticated APIs
export async function scrapeMunicodeOrdinances(
  years?: string[]
): Promise<ScrapedOrdinance[]> {
  const ordinances: ScrapedOrdinance[] = [];
  const baseUrl =
    'https://library.municode.com/ga/flowery_branch/ordinances/code_of_ordinances';

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
