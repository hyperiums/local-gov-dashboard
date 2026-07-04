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

// Extract financial report links from the city's Financial Reports page
export function parseFinancialReportLinks(html: string): FinancialDocument[] {
  const reports: FinancialDocument[] = [];
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
      // The city posts the proposed budget months before adoption; label
      // it honestly so the site never presents it as the adopted budget
      title = filename.includes('proposed')
        ? `${fiscalYear} Proposed Budget`
        : `${fiscalYear} Annual Operating & Capital Budget`;
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

    const duplicateIdx = reports.findIndex(
      (r) => r.fiscalYear === fiscalYear && r.type === type
    );
    if (duplicateIdx >= 0) {
      // Once the adopted budget book is published it supersedes the
      // proposed one for the same fiscal year
      const existing = reports[duplicateIdx];
      if (existing.title.includes('Proposed') && !title.includes('Proposed')) {
        reports[duplicateIdx] = { fiscalYear, type, title, url: cleanUrl };
      }
      continue;
    }

    reports.push({ fiscalYear, type, title, url: cleanUrl });
  }

  reports.sort((a, b) => {
    const yearA = parseInt(a.fiscalYear.replace('FY', ''));
    const yearB = parseInt(b.fiscalYear.replace('FY', ''));
    return yearB - yearA;
  });

  return reports;
}

// Scrape the city website for financial report links
// Source: https://www.flowerybranchga.org/departments/finance/financial_reports.php
export async function scrapeFinancialReports(): Promise<FinancialDocument[]> {
  try {
    const html = await fetchHtml(DATA_SOURCES.cityWebsite.financialReports);
    return parseFinancialReportLinks(html);
  } catch (error) {
    console.error('Failed to scrape financial reports:', error);
  }

  return [];
}

// Get financial documents by type
export async function getFinancialDocumentsByType(
  type: FinancialDocType
): Promise<FinancialDocument[]> {
  const allDocs = await scrapeFinancialReports();
  return allDocs.filter((doc) => doc.type === type);
}
