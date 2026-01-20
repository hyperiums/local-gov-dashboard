// Scraper module - re-exports all scraping utilities
// See README.md for documentation

// Shared utilities
export {
  MONTH_NAMES,
  ALT_MONTH_NAMES,
  fetchHtml,
  fetchPdf,
  fetchPdfWithFallback,
  getMonthNumber,
} from './utils';
export type { ScrapedMeeting, ScrapedAgendaItem } from './utils';

// CivicClerk (meetings, agendas, minutes, votes)
export {
  scrapeCivicClerkMeetingDetails,
  discoverCivicClerkEventIds,
  getCivicClerkAgendaPdfUrl,
  fetchCivicClerkAgendaPdf,
  getCivicClerkMinutesPdfUrl,
  fetchCivicClerkMinutesPdf,
  scrapeCivicClerkMeetingsWithPlaywright,
  fetchVoteOutcomesFromOverview,
  hasVoteDataAvailable,
} from './civicclerk';
export type { CivicClerkMeeting, VoteOutcome } from './civicclerk';

// Resolutions and ordinance linking
export {
  fetchCivicClerkResolutionAttachments,
  createOrdinanceFromAgendaItem,
  linkOrdinancesToMeetings,
  updateOrdinanceDatesFromMeetings,
  extractResolutionsFromAgendaItems,
} from './resolutions';
export type { LinkResult } from './resolutions';

// Ordinance inference
export { inferReadingsFromDiscussed } from './ordinance-linking';

// Permits
export { getPermitPdfUrl, parsePermitPdfText } from './permits';

// Financial documents
export {
  scrapeFinancialReports,
  getFinancialDocumentsByType,
} from './financial';
export type { FinancialDocType, FinancialDocument } from './financial';

// Civic documents (SPLOST, notices, etc.)
export { scrapeCivicDocuments, getCivicDocumentsByType } from './civic-docs';
export type { CivicDocType, CivicDocument } from './civic-docs';

// Municode ordinances
export { getMunicodePdfUrl, scrapeMunicodeOrdinances, scrapeMunicodeSupplementHistory } from './municode';
export type { ScrapedOrdinance, SupplementHistoryEntry } from './municode';

// Business listings
export { getBusinessPdfUrl, parseBusinessPdfText } from './business';
