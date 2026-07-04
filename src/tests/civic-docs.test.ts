import { describe, it, expect } from 'vitest';
import { parseCivicDocumentLinks } from '@/lib/scraper/civic-docs';

// Mirrors the live water-quality listing page: legacy underscore names,
// the 2025 report with literal spaces (the naming the city switched to),
// placeholder junk, and shared-nav PDFs that must not become documents.
const WATER_QUALITY_HTML = `
<a href="Documents/Departments/Water Wastewater/Water Quality Reports/2020_water_quality_report.pdf?t=202409300950140">2020</a>
<a href="Documents/Departments/Water Wastewater/Water Quality Reports/2024 CCR.pdf?t=202506241216350">2024 CCR</a>
<a href="Documents/Departments/Water Wastewater/Water Quality Reports/2025 Water Quality Report.pdf?t=202605271148510">2025</a>
<a href="Documents/Departments/Water Wastewater/Water Quality Reports/lorem_ipsum.pdf?t=1">placeholder</a>
<a href="Documents/How Do I/Apply for Obtain/Garage Sale Permit.pdf">nav junk</a>
<a href="Documents/Departments/Administration/election_results.pdf">nav junk</a>
`;

describe('parseCivicDocumentLinks', () => {
  const docs = parseCivicDocumentLinks(WATER_QUALITY_HTML, 'water-quality');
  const ids = docs.map(d => d.id);

  it('discovers space-named reports like "2025 Water Quality Report.pdf"', () => {
    expect(ids).toContain('2025-Water-Quality-Report');
  });

  it('still discovers legacy underscore and CCR names', () => {
    expect(ids).toContain('2020-water-quality-report');
    expect(ids).toContain('2024-CCR');
  });

  it('excludes placeholders and shared-nav PDFs', () => {
    expect(docs).toHaveLength(3);
  });

  it('derives dates and strips query strings from urls', () => {
    const report2025 = docs.find(d => d.id === '2025-Water-Quality-Report');
    expect(report2025?.date).toBe('2025');
    expect(report2025?.url).not.toContain('?t=');
    expect(report2025?.title).toBe('2025 Water Quality Report');
  });
});
