// Business listing PDF scraping and parsing
import { cityWebsiteUrl } from '../city-config-client';
import { MONTH_NAMES, ALT_MONTH_NAMES } from './utils';

// Get business listing PDF URL for a given month
export function getBusinessPdfUrl(year: string, month: string): string[] {
  const monthName = MONTH_NAMES[month];
  const altNames = ALT_MONTH_NAMES[month] || [];

  const urls = [
    `${cityWebsiteUrl}/${monthName}${year}businesslisting.pdf`,
    ...altNames.map(
      (name) => `${cityWebsiteUrl}/${name}${year}businesslisting.pdf`
    ),
  ];

  return urls;
}

// Parse PDF text to extract business data
export function parseBusinessPdfText(
  text: string,
  month: string,
  sourceUrl: string
): {
  id: string;
  month: string;
  name: string;
  address?: string;
  type?: string;
  sourceUrl: string;
}[] {
  const businesses: ReturnType<typeof parseBusinessPdfText> = [];

  const lines = text.split('\n').filter((line) => line.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (
      line.toLowerCase().includes('business name') ||
      line.toLowerCase().includes('new business') ||
      line.toLowerCase().includes('city of flowery') ||
      line.length < 3
    ) {
      continue;
    }

    const isLikelyBusinessName =
      /^[A-Z]/.test(line) &&
      !line.match(/^\d+\s+/) &&
      line.length > 3 &&
      line.length < 100;

    if (isLikelyBusinessName) {
      const business: (typeof businesses)[0] = {
        id: `business-${month}-${businesses.length}`,
        month,
        name: line,
        sourceUrl,
      };

      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const addressMatch = nextLine.match(/(\d+\s+[A-Za-z\s]+)/);
        if (addressMatch) {
          business.address = addressMatch[1].trim();
          i++;
        }
      }

      businesses.push(business);
    }
  }

  return businesses;
}
