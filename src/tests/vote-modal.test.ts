import { describe, it, expect } from 'vitest';
import { parseVoteModal } from '@/lib/scraper/civicclerk';

// Modal text below is copied from live CivicClerk meeting-overview pages.
describe('parseVoteModal', () => {
  it('reads a single motion and its result', () => {
    const parsed = parseVoteModal('Motions/Votes Detail\nMotion: Approve\nPassed');
    expect(parsed).toMatchObject({ motion: 'Approve', result: 'passed' });
  });

  // The Hemingway perimeter-fencing item, June 18 2026: council's first motion
  // to advance failed, a second motion to advance carried. Reading the first
  // result would publish two ordinances that are still moving as "failed".
  it('takes the last motion when an item has more than one', () => {
    const parsed = parseVoteModal(
      'Motions/Votes Detail\nMotion: Advance\nFailed\nMotion: Advance\nPassed'
    );
    expect(parsed).toMatchObject({ motion: 'Advance', result: 'passed' });
  });

  it('does not let a resultless motion borrow the next motion\'s result', () => {
    const parsed = parseVoteModal('Motions/Votes Detail\nMotion: Deny\nMotion: Advance\nPassed');
    expect(parsed).toMatchObject({ motion: 'Advance', result: 'passed' });
  });

  it('treats a deny motion with no recorded result as carried', () => {
    const parsed = parseVoteModal('Motions/Votes Detail\nMotion: Deny\nInitiated by Council Member');
    expect(parsed).toMatchObject({ motion: 'Deny', result: 'passed' });
  });

  it('reports an error rather than guessing when there is no result at all', () => {
    expect(parseVoteModal('Motions/Votes Detail\nNothing useful here')).toHaveProperty('error');
  });

  it('keeps the vote counts alongside the decisive motion', () => {
    const parsed = parseVoteModal(
      'Motions/Votes Detail\nMotion: Approve\nPassed\nYes 5\nNo 0\nAbstain 0'
    );
    expect(parsed).toMatchObject({ motion: 'Approve', result: 'passed', yesCount: 5, noCount: 0 });
  });
});
