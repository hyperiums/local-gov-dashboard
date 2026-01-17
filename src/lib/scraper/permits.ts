// Permit PDF scraping and parsing
import { cityWebsiteUrl } from '../city-config-client';
import { MONTH_NAMES, ALT_MONTH_NAMES } from './utils';

// Get permit PDF URL for a given month
export function getPermitPdfUrl(year: string, month: string): string[] {
  const monthName = MONTH_NAMES[month];
  const altNames = ALT_MONTH_NAMES[month] || [];
  const monthLower = monthName.toLowerCase();
  const basePath = `${cityWebsiteUrl}/Documents/Departments/Community%20Development/Monthly%20Permit%20Statistics`;

  const urls: string[] = [];

  // Root level - "permitlisting" format (2024+)
  urls.push(`${cityWebsiteUrl}/${monthName}${year}permitlisting.pdf`);
  altNames.forEach((name) =>
    urls.push(`${cityWebsiteUrl}/${name}${year}permitlisting.pdf`)
  );

  // Root level - "permit" format (2020 and some others)
  urls.push(`${cityWebsiteUrl}/${monthName}${year}permit.pdf`);
  altNames.forEach((name) =>
    urls.push(`${cityWebsiteUrl}/${name}${year}permit.pdf`)
  );

  // Documents folder - "permitlisting" format (2023)
  urls.push(`${basePath}/${year}/${monthLower}${year}permitlisting.pdf`);
  altNames.forEach((name) =>
    urls.push(`${basePath}/${year}/${name.toLowerCase()}${year}permitlisting.pdf`)
  );

  // Documents folder - "permit_listing" format (some 2023)
  urls.push(`${basePath}/${year}/${monthLower}${year}permit_listing.pdf`);

  // Documents folder - "permit" format (2022 and earlier)
  urls.push(`${basePath}/${year}/${monthLower}${year}permit.pdf`);
  altNames.forEach((name) =>
    urls.push(`${basePath}/${year}/${name.toLowerCase()}${year}permit.pdf`)
  );

  return urls;
}

// Parse PDF text to extract permit data
export function parsePermitPdfText(
  text: string,
  month: string,
  sourceUrl: string
): {
  id: string;
  month: string;
  type: string;
  address: string;
  description: string;
  value?: number;
  sourceUrl: string;
}[] {
  const permits: ReturnType<typeof parsePermitPdfText> = [];

  const lines = text.split('\n').filter((line) => line.trim());

  let currentPermit: Partial<(typeof permits)[0]> | null = null;

  for (const line of lines) {
    const addressMatch = line.match(
      /(\d+\s+[A-Za-z\s]+(?:Street|St|Road|Rd|Drive|Dr|Avenue|Ave|Lane|Ln|Way|Circle|Cir|Court|Ct))/i
    );

    const typeMatch = line.match(
      /(Residential|Commercial|New Construction|Renovation|Addition|Electrical|Plumbing|HVAC|Mechanical)/i
    );

    const valueMatch = line.match(/\$?([\d,]+(?:\.\d{2})?)/);

    if (addressMatch) {
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
