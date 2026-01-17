// Financial document scraping
import { cityWebsiteUrl } from '../city-config-client';
import { DATA_SOURCES } from '../types';
import { fetchHtml } from './utils';

// Financial document types
export type FinancialDocType = 'budget' | 'audit' | 'pafr' | 'digest' | 'other';

export interface FinancialDocument {
  fiscalYear: string;
  type: FinancialDocType;
  title: string;
  url: string;
}

// Scrape the city website for financial report links
// Source: https://www.flowerybranchga.org/departments/finance/financial_reports.php
export async function scrapeFinancialReports(): Promise<FinancialDocument[]> {
  const reports: FinancialDocument[] = [];

  try {
    const html = await fetchHtml(DATA_SOURCES.cityWebsite.financialReports);

    const linkMatches = html.matchAll(/href="([^"]*\.pdf[^"]*)"/gi);

    for (const match of linkMatches) {
      let url = match[1];

      const lowerUrl = url.toLowerCase();
      if (
        !lowerUrl.includes('finance') &&
        !lowerUrl.includes('budget') &&
        !lowerUrl.includes('audit') &&
        !lowerUrl.includes('financial') &&
        !lowerUrl.includes('pafr') &&
        !lowerUrl.includes('cafr') &&
        !lowerUrl.includes('digest')
      ) {
        continue;
      }

      if (!url.startsWith('http')) {
        const path = url.startsWith('/') ? url : `/${url}`;
        url = `${cityWebsiteUrl}${path}`;
      }

      const cleanUrl = url.split('?')[0];

      const yearMatch = url.match(/(?:FY\s*)?(\d{4})/i);
      const fiscalYear = yearMatch ? `FY${yearMatch[1]}` : 'Unknown';

      const filename = cleanUrl.split('/').pop()?.toLowerCase() || lowerUrl;

      let type: FinancialDocType = 'other';
      let title = '';

      if (filename.includes('pafr') || filename.includes('popular')) {
        type = 'pafr';
        title = `${fiscalYear} Popular Annual Financial Report`;
      } else if (
        filename.includes('digest') ||
        filename.includes('five_year') ||
        filename.includes('five year') ||
        filename.includes('five%20year')
      ) {
        type = 'digest';
        title = `${fiscalYear} Five Year Digest History`;
      } else if (filename.includes('budget')) {
        type = 'budget';
        title = `${fiscalYear} Annual Operating & Capital Budget`;
      } else if (
        filename.includes('comprehensive') ||
        filename.includes('cafr') ||
        filename.includes('audit') ||
        filename.includes('comp-fin') ||
        (filename.includes('annual') && filename.includes('financial'))
      ) {
        type = 'audit';
        title = `${fiscalYear} Annual Comprehensive Financial Report`;
      }

      if (type === 'other' || fiscalYear === 'Unknown') continue;

      const isDuplicate = reports.some(
        (r) => r.fiscalYear === fiscalYear && r.type === type
      );
      if (isDuplicate) continue;

      reports.push({ fiscalYear, type, title, url: cleanUrl });
    }

    reports.sort((a, b) => {
      const yearA = parseInt(a.fiscalYear.replace('FY', ''));
      const yearB = parseInt(b.fiscalYear.replace('FY', ''));
      return yearB - yearA;
    });
  } catch (error) {
    console.error('Failed to scrape financial reports:', error);
  }

  return reports;
}

// Get financial documents by type
export async function getFinancialDocumentsByType(
  type: FinancialDocType
): Promise<FinancialDocument[]> {
  const allDocs = await scrapeFinancialReports();
  return allDocs.filter((doc) => doc.type === type);
}
