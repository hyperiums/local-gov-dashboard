// Civic document scraping (SPLOST, notices, strategic plans, water quality)
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

      const linkMatches = html.matchAll(/href="([^"]*\.pdf[^"]*)"/gi);

      for (const match of linkMatches) {
        let url = match[1];

        const lowerUrl = url.toLowerCase();
        if (
          lowerUrl.includes('garage_sale') ||
          lowerUrl.includes('election_results') ||
          lowerUrl.includes('social_media') ||
          lowerUrl.includes('employee_benefits') ||
          lowerUrl.includes('court_calendar')
        ) {
          continue;
        }

        if (type === 'splost' && !lowerUrl.includes('splost')) continue;
        if (
          type === 'notice' &&
          !lowerUrl.includes('notice') &&
          !lowerUrl.includes('press')
        )
          continue;
        if (type === 'strategic' && !lowerUrl.includes('strategic')) continue;
        if (type === 'water-quality') {
          if (
            lowerUrl.includes('lorem') ||
            lowerUrl.includes('landscape') ||
            lowerUrl.includes('guide')
          )
            continue;
          if (
            !lowerUrl.includes('ccr') &&
            !lowerUrl.includes('water_quality') &&
            !lowerUrl.includes('water-quality') &&
            !lowerUrl.includes('quality_report')
          )
            continue;
        }

        if (!url.startsWith('http')) {
          const path = url.startsWith('/') ? url : `/${url}`;
          url = `https://www.flowerybranchga.org${path}`;
        }

        const cleanUrl = url.split('?')[0];

        const id =
          cleanUrl
            .split('/')
            .pop()
            ?.replace(/\.pdf$/i, '')
            .replace(/[^a-zA-Z0-9]/g, '-') || `doc-${Date.now()}`;

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

// Get civic documents by type
export async function getCivicDocumentsByType(
  type: CivicDocType
): Promise<CivicDocument[]> {
  return scrapeCivicDocuments(type);
}
