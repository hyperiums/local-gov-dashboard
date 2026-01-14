import { chromium } from 'playwright';

const eventIds = [114, 103, 130, 149];

async function getMinutesPdfUrl(eventId) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  const eventUrl = `https://flowerybranchga.portal.civicclerk.com/event/${eventId}/files`;
  console.log(`Navigating to ${eventUrl}...`);
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
    await browser.close();
    return null;
  }

  // Click on Minutes to load it in the viewer
  await page.evaluate(() => {
    const items = document.querySelectorAll('li.MuiListItem-container button');
    for (const btn of items) {
      if (btn.textContent?.includes('Minutes') && !btn.getAttribute('title')) {
        btn.click();
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
  await browser.close();
  return pdfUrl;
}

async function main() {
  for (const eventId of eventIds) {
    try {
      const url = await getMinutesPdfUrl(eventId);
      if (url) {
        console.log(`\nEvent ${eventId} Minutes URL:\n${url}\n`);
      }
    } catch (e) {
      console.error(`Error for event ${eventId}:`, e.message);
    }
  }
}

main();
