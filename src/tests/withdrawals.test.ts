import { describe, it, expect } from 'vitest';
import { detectWithdrawnOrdinances } from '@/lib/withdrawals';

// The passages below are taken from the Flowery Branch minutes of 2026-05-07,
// where four ordinances were pulled before any hearing. Line breaks are kept as
// PDF extraction produces them, since a sentence spanning a wrap is the normal
// case rather than an edge one.
const MAY_7 = `
Adoption of Agenda: Mayor McClellan announced that the developer had withdrawn the applications in regard to
Ordinances 780, 781, 782. He further advised the developer had withdrawn the application in
regard to Ordinance 783. As a result, there would be no public hearing for Ordinances
780,781,782, and 783.
There was a motion made to adopt the agenda as presented, removing Ordinances 780, 781, 782, 783
from the Public Hearing.
Public Hearing:
b. Public Hearing and First Read of Ordinance 780 for the Annexation and Rezoning at 0 Sasser Road;
Rezoning from Hall County Planned Residential Development (PRD) to City of Flowery Branch Single
Family Townhome (SF-TH). - This item was removed from the agenda.
c. Public Hearing and First Read of Ordinance 781 for the Consideration of a Variance Associated with 0
Sasser Road for the Reduction of Minimum Lot Area for Attached Townhomes, Article 6, Table 6.2 from
3,500 square feet to 2,600 square feet. - This item was removed from the agenda.
d. Public Hearing and First Reading of Ordinance 782 to Consider a Variance for Property Located at 0
Sasser Road from the Requirements of Zoning Ordinance 10.21(c), Which Mandates That Streets
Exceeding 360 feet in Length Incorporate a Minimum of Twenty-Five (25) feet of Lateral Deviation.
- This item was removed from the agenda.
e. Public Hearing and First Read of Ordinance 783 for the Rezoning of Parcel 08099 000004 (0 McEver
Road) From M-1 (Light Manufacturing and Industrial) to M-1. - This item was removed from the agenda.
Unfinished Business:
a. Second Read to Consider Proposed Amendments to the Planned Unit Development (PUD) Conditions,
Applicable to the Commercial Use Section of Sterling on the Lake, Pursuant to Ordinance 239-N / 240-N.
There was a motion made to approve Ordinance 239-N and 240-N.
Result: passed
`;

describe('detectWithdrawnOrdinances', () => {
  it('finds every ordinance the applicant withdrew', () => {
    const numbers = detectWithdrawnOrdinances(MAY_7).map(w => w.number);
    expect(numbers).toEqual(['780', '781', '782', '783']);
  });

  // The ordinances adopted the same evening sit a few lines from the withdrawal
  // language. Reporting one of those as withdrawn would tell residents a
  // enacted law had been pulled, which is the worst error this can make.
  it('does not touch ordinances that were voted on that night', () => {
    const numbers = detectWithdrawnOrdinances(MAY_7).map(w => w.number);
    expect(numbers).not.toContain('239-N');
    expect(numbers).not.toContain('240-N');
  });

  // Lot areas, street lengths and parcel identifiers all read as bare numbers
  // in the same sentences. Only a reference introduced by "Ordinance" counts.
  it('ignores measurements and parcel numbers near the withdrawal note', () => {
    const numbers = detectWithdrawnOrdinances(MAY_7).map(w => w.number);
    for (const noise of ['500', '600', '360', '021', '099', '004']) {
      expect(numbers).not.toContain(noise);
    }
  });

  it('carries the sentence each finding was read from', () => {
    for (const finding of detectWithdrawnOrdinances(MAY_7)) {
      expect(finding.evidence.length).toBeGreaterThan(15);
      expect(/withdrew|withdrawn|removed from the agenda|removing/i.test(finding.evidence)).toBe(true);
    }
  });

  it('prefers a statement naming the ordinance over a note that merely follows it', () => {
    const findings = detectWithdrawnOrdinances(MAY_7);
    expect(findings.every(f => f.basis === 'stated')).toBe(true);
  });

  it('reads a withdrawal stated on its own, with no per-item note', () => {
    const numbers = detectWithdrawnOrdinances(
      'The applicant withdrew the application for Ordinance 812 prior to the hearing.'
    ).map(w => w.number);
    expect(numbers).toEqual(['812']);
  });

  it('attributes a bare note to the item it trails, not the one before it', () => {
    const findings = detectWithdrawnOrdinances(
      'a. First Read of Ordinance 900 for Rezoning. Approved.\n' +
      'b. First Read of Ordinance 901 for Annexation. - This item was removed from the agenda.'
    );
    expect(findings.map(f => f.number)).toEqual(['901']);
  });

  it('finds nothing in minutes where every item was voted on', () => {
    expect(detectWithdrawnOrdinances(
      'a. Second Reading of Ordinance 778. There was a motion made to approve. Result: passed'
    )).toEqual([]);
  });

  it('does not treat a failed motion as a withdrawal', () => {
    expect(detectWithdrawnOrdinances(
      'There was a motion made to approve the first reading of Ordinance 775. Result: failed'
    )).toEqual([]);
  });
});

// Found by running the detector across sampled minutes from 2024-2026 rather
// than the one meeting it was written for. Withdrawing a motion is routine
// floor procedure; council adopted ordinance 733 minutes later, and it is
// published on Municode today.
describe('withdrawal of a motion is not withdrawal of the ordinance', () => {
  const FEB_2025 = `MOTION: William McDaniel SECOND: Oliver McCellan
Council held a discussion with Director McCrary. Council Member McDaniel withdrew the original
motion to approve the first reading of Ordinance 733.
There was a motion made to approve Ordinance 733 with the amendments.
Result: passed`;

  it('does not report an ordinance whose motion was withdrawn', () => {
    expect(detectWithdrawnOrdinances(FEB_2025)).toEqual([]);
  });

  it.each([
    'Council Member Smith withdrew his motion to approve Ordinance 500.',
    'The maker withdrew the motion to table Ordinance 501.',
    'Council Member Jones withdrew her second on Ordinance 502.',
    'The council withdrew that amendment to Ordinance 503.',
  ])('ignores procedural withdrawal: %s', (line) => {
    expect(detectWithdrawnOrdinances(line)).toEqual([]);
  });

  it('still reports a withdrawal of the application itself', () => {
    expect(detectWithdrawnOrdinances(
      'The applicant withdrew the application for Ordinance 812 prior to the hearing.'
    ).map(w => w.number)).toEqual(['812']);
  });
});
