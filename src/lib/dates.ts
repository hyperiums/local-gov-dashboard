// Dynamic date utilities to avoid hardcoded years

import { clearGovSpendingBaseUrl } from './city-config-client';

/**
 * Get the current fiscal year (July 1 - June 30)
 * Returns the ending year of the fiscal year (e.g., FY2025 = July 2024 - June 2025)
 */
export function getCurrentFiscalYear(): number {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
}

/**
 * Get the current calendar year
 */
export function getCurrentYear(): number {
  return new Date().getFullYear();
}

/**
 * Get an array of recent years, starting from current year going back
 * @param count Number of years to include (default: 3)
 */
export function getRecentYears(count: number = 3): string[] {
  const current = getCurrentYear();
  return Array.from({ length: count }, (_, i) => String(current - i));
}

/**
 * Get an array of recent fiscal years
 * @param count Number of fiscal years to include (default: 3)
 */
export function getRecentFiscalYears(count: number = 3): string[] {
  const current = getCurrentFiscalYear();
  return Array.from({ length: count }, (_, i) => String(current - i));
}

/**
 * Get years for historical data (older years, excluding recent)
 * @param startYear Oldest year to include
 * @param excludeRecent Number of recent years to exclude (default: 3)
 */
export function getHistoricalYears(startYear: number = 2009, excludeRecent: number = 3): string[] {
  const current = getCurrentYear();
  const endYear = current - excludeRecent;
  const years: string[] = [];
  for (let year = endYear; year >= startYear; year--) {
    years.push(String(year));
  }
  return years;
}

/**
 * Get ClearGov spending URL with current year
 */
export function getClearGovSpendingUrl(): string {
  return `${clearGovSpendingBaseUrl}/${getCurrentYear()}/native/expenditures`;
}

/**
 * Get all months as two-digit strings
 */
export function getAllMonths(): string[] {
  return ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
}

/**
 * Format a date string (YYYY-MM-DD) for display, avoiding timezone issues.
 * Appends T12:00:00 to prevent UTC midnight from rolling back a day in EST.
 */
export function formatDate(
  dateString: string,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string {
  return new Date(dateString + 'T12:00:00').toLocaleDateString('en-US', options);
}
