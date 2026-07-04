import { describe, it, expect } from 'vitest';
import { parseFinancialReportLinks } from '@/lib/scraper/financial';

const FINANCE_HTML = `
<a href="Documents/Departments/Finance/Audits & Budgets/FY2027 Proposed Budget 6.3.2026.pdf?t=202606031249030">FY2027 proposed</a>
<a href="Documents/Departments/Finance/Audits & Budgets/FY2026 Operating and Capital Budget.pdf?t=202510021715260">FY2026 budget</a>
<a href="Documents/Departments/Finance/Audits & Budgets/2024 City of Flowery Branch Annual Comprehensive Financial Report.pdf?t=1">FY2024 ACFR</a>
<a href="FY2024 PAFR City of Flowery Branch.pdf?t=1">FY2024 PAFR</a>
`;

// The same fiscal year with both a proposed and an adopted budget —
// adopted must win no matter which the page lists first
const SUPERSEDED_HTML = `
<a href="Documents/Finance/FY2027 Proposed Budget 6.3.2026.pdf">proposed first</a>
<a href="Documents/Finance/FY2027 Operating and Capital Budget.pdf">adopted second</a>
`;

describe('parseFinancialReportLinks', () => {
  const reports = parseFinancialReportLinks(FINANCE_HTML);

  it('labels proposed budgets as proposed, not adopted', () => {
    const fy2027 = reports.find(r => r.fiscalYear === 'FY2027' && r.type === 'budget');
    expect(fy2027?.title).toBe('FY2027 Proposed Budget');
  });

  it('keeps the adopted title for regular budget books', () => {
    const fy2026 = reports.find(r => r.fiscalYear === 'FY2026' && r.type === 'budget');
    expect(fy2026?.title).toBe('FY2026 Annual Operating & Capital Budget');
  });

  it('classifies ACFRs as audits and PAFRs separately', () => {
    expect(reports.find(r => r.fiscalYear === 'FY2024' && r.type === 'audit')).toBeTruthy();
    expect(reports.find(r => r.fiscalYear === 'FY2024' && r.type === 'pafr')).toBeTruthy();
  });

  it('lets an adopted budget supersede the proposed one for the same year', () => {
    const superseded = parseFinancialReportLinks(SUPERSEDED_HTML)
      .filter(r => r.fiscalYear === 'FY2027' && r.type === 'budget');
    expect(superseded).toHaveLength(1);
    expect(superseded[0].title).toBe('FY2027 Annual Operating & Capital Budget');
    expect(superseded[0].url).toContain('FY2027 Operating and Capital Budget.pdf');
  });
});
