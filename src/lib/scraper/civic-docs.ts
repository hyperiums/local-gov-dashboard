// Civic document scraping (SPLOST, notices, strategic plans, water quality)
import { cityWebsiteUrl } from '../city-config-client';
import { DATA_SOURCES } from '../types';
import { fetchHtml } from './utils';

// Civic document types for the Documents page
export type CivicDocType = 'splost' | 'notice' | 'strategic' | 'water-quality';

export interface CivicDocument {
  id: string;
  type: CivicDocType;
  title: string;
  url: string;
  date?: string;
}

// Scrape civic documents from various city website pages
export async function scrapeCivicDocuments(
  docType?: CivicDocType
): Promise<CivicDocument[]> {
  const documents: CivicDocument[] = [];

  const sources: Record<CivicDocType, string> = {
    splost: DATA_SOURCES.cityWebsite.splostReports,
    notice: DATA_SOURCES.cityWebsite.publicNotices,
    strategic: DATA_SOURCES.cityWebsite.strategicPlan,
    'water-quality': DATA_SOURCES.cityWebsite.waterQualityReports,
  };

  const typesToScrape: CivicDocType[] = docType
    ? [docType]
    : ['splost', 'notice', 'strategic', 'water-quality'];

  for (const type of typesToScrape) {
    try {
      const html = await fetchHtml(sources[type]);
      documents.push(...parseCivicDocumentLinks(html, type));
    } catch (error) {
      console.error(`Failed to scrape ${type} documents:`, error);
    }
  }

  documents.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  return documents;
}

// Extract civic document links from a city listing page. The city's file
// naming drifts over time (2020_water_quality_report.pdf vs
// "2025 Water Quality Report.pdf"), so keyword matching runs against a
// normalized form where %20, spaces, and hyphens all become underscores.
export function parseCivicDocumentLinks(html: string, type: CivicDocType): CivicDocument[] {
  const documents: CivicDocument[] = [];
  const linkMatches = html.matchAll(/href="([^"]*\.pdf[^"]*)"/gi);

  for (const match of linkMatches) {
    let url = match[1];

    const normalizedUrl = url.toLowerCase().replace(/%20|[\s-]+/g, '_');
    if (
      normalizedUrl.includes('garage_sale') ||
      normalizedUrl.includes('election_results') ||
      normalizedUrl.includes('social_media') ||
      normalizedUrl.includes('employee_benefits') ||
      normalizedUrl.includes('court_calendar')
    ) {
      continue;
    }

    if (type === 'splost' && !normalizedUrl.includes('splost')) continue;
    if (
      type === 'notice' &&
      !normalizedUrl.includes('notice') &&
      !normalizedUrl.includes('press')
    )
      continue;
    if (type === 'strategic' && !normalizedUrl.includes('strategic')) continue;
    if (type === 'water-quality') {
      if (
        normalizedUrl.includes('lorem') ||
        normalizedUrl.includes('landscape') ||
        normalizedUrl.includes('guide')
      )
        continue;
      if (
        !normalizedUrl.includes('ccr') &&
        !normalizedUrl.includes('water_quality') &&
        !normalizedUrl.includes('quality_report')
      )
        continue;
    }

    if (!url.startsWith('http')) {
      const path = url.startsWith('/') ? url : `/${url}`;
      url = `${cityWebsiteUrl}${path}`;
    }

    const cleanUrl = url.split('?')[0];

    const id =
      cleanUrl
        .split('/')
        .pop()
        ?.replace(/\.pdf$/i, '')
        .replace(/%20/g, '-')
        .replace(/[^a-zA-Z0-9]/g, '-') || `doc-${documents.length}`;

    const filename = cleanUrl.split('/').pop() || '';
    const title = filename
      .replace(/\.pdf$/i, '')
      .replace(/%20/g, ' ')
      .replace(/[-_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const yearMatch = filename.match(/(?:FY)?(\d{4})/i);
    const dateMatch = filename.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    let date: string | undefined;
    if (dateMatch) {
      date = `${dateMatch[3]}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`;
    } else if (yearMatch) {
      date = yearMatch[1];
    }

    const isDuplicate = documents.some((d) => d.url === cleanUrl);
    if (isDuplicate) continue;

    documents.push({
      id,
      type,
      title,
      url: cleanUrl,
      date,
    });
  }

  return documents;
}

// Get civic documents by type
export async function getCivicDocumentsByType(
  type: CivicDocType
): Promise<CivicDocument[]> {
  return scrapeCivicDocuments(type);
}
