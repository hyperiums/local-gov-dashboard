/**
 * Parsing of ordinance and resolution references out of council agenda items,
 * meeting-overview vote titles, and minutes text.
 *
 * These live in one module because the same title is read by three different
 * pipeline stages (agenda scraping, vote-outcome matching, ordinance linking).
 * When each stage carried its own regex they drifted apart, and legislation the
 * council was actively working stayed invisible or stayed "pending" after it had
 * been decided.
 */

// CivicClerk emits U+2011 (non-breaking hyphen) and en/em dashes where the
// printed agenda shows a plain hyphen — "Ordinance 239‑N / 240‑N" is written
// with U+2011. Normalising first lets one pattern read every variant.
const DASH_VARIANTS = /[‐‑‒–—−]/g;

export function normalizeRefText(text: string): string {
  return text.replace(DASH_VARIANTS, '-').replace(/ /g, ' ');
}

// Municipal numbering varies by city, and this dashboard is meant to be adopted
// by others, so the year-prefixed form is tried before the plain one — matching
// plain digits first would read "Ordinance 2024-15" as ordinance 2024.
//
// Flowery Branch numbers are three digits, optionally carrying a letter suffix
// marking an amendment to an earlier ordinance, written either hyphenated
// ("702-A", "375-A") or attached ("324A", "504B"). Other cities run shorter or
// longer, or prefix the year.
//
// The lookahead keeps a cited code section out: "Zoning Ordinance 10.21(c)"
// names a requirement, not an ordinance the council is acting on.
const ORDINANCE_NUMBER = /^(?:\d{4}-\d{1,4}|\d{1,6}(?!\.\d)(?:-[A-Za-z]\b|[A-Z]\b)?)\b/;
const RESOLUTION_NUMBER = /^(?:\d{2,4}-\d{1,4}|\d{1,6}(?!\.\d))\b/;

// One item routinely carries several numbers: "Ordinances 774, 775, and 776",
// "Ordinances 702-A and 715-A", "Ordinance 239-N / 240-N". The Oxford-comma
// form must be tried before the bare comma, or the "and" is left stranded.
const LIST_SEPARATOR = /^\s*(?:,\s*and\b|,|and\b|&|\/)\s*/i;

const ORDINANCE_KEYWORD = /ordinances?(?:\s+nos?\.?)?\s*#?\s*/gi;
const RESOLUTION_KEYWORD = /resolutions?(?:\s+(?:nos?\.?|numbers?))?\s*#?\s*/gi;

function extractNumberRuns(text: string, keyword: RegExp, numberPattern: RegExp): string[] {
  const normalized = normalizeRefText(text);
  const found: string[] = [];

  keyword.lastIndex = 0;
  let keywordMatch: RegExpExecArray | null;

  while ((keywordMatch = keyword.exec(normalized)) !== null) {
    let cursor = keywordMatch.index + keywordMatch[0].length;

    // The first number must sit directly after the keyword; anything else means
    // the word was prose ("Alcohol Ordinance Discussion", "the Zoning Ordinance,
    // including...") rather than a reference.
    let numberMatch = numberPattern.exec(normalized.slice(cursor));
    if (!numberMatch) continue;

    while (numberMatch) {
      found.push(numberMatch[0]);
      cursor += numberMatch[0].length;

      const separator = LIST_SEPARATOR.exec(normalized.slice(cursor));
      if (!separator) break;

      const afterSeparator = cursor + separator[0].length;
      numberMatch = numberPattern.exec(normalized.slice(afterSeparator));
      if (numberMatch) cursor = afterSeparator;
    }
  }

  return [...new Set(found)];
}

/**
 * Every ordinance number referenced by a title, in the order it appears.
 * Returns an empty array for discussion items that name no ordinance.
 */
export function extractOrdinanceNumbers(text: string): string[] {
  return extractNumberRuns(text, ORDINANCE_KEYWORD, ORDINANCE_NUMBER);
}

/** Every resolution number referenced by a title, in the order it appears. */
export function extractResolutionNumbers(text: string): string[] {
  return extractNumberRuns(text, RESOLUTION_KEYWORD, RESOLUTION_NUMBER);
}

const FIRST_READ_MARKER = /\bfirst\s+read(?:ing)?s?\b/i;
const SECOND_READ_MARKER = /\bsecond\s+read(?:ing)?s?\b/i;

/**
 * Which reading an item represents. The city writes both "Second Reading of X"
 * and "Second Read to Consider X"; only the former used to be recognised, so
 * second reads never advanced an ordinance to adopted.
 *
 * Staff also recommend "advancing X to a Second Reading" inside items that are
 * themselves the first read, so whichever marker appears first in the title
 * wins — otherwise a first read is mistaken for an adoption vote.
 */
// How much an action says about where an ordinance stands. A vote reading is
// only allowed to replace what is already recorded if it says at least as much,
// so a bare "the motion carried" cannot demote a known adoption.
const ACTION_RANK: Record<string, number> = {
  adopted: 6,
  denied: 6,
  tabled: 6,
  failed: 5,
  second_reading: 4,
  first_reading: 3,
  approved: 2,
  public_hearing: 2,
  amended: 2,
  discussed: 1,
};

export function actionRank(action: string | null | undefined): number {
  return ACTION_RANK[(action ?? '').toLowerCase()] ?? 0;
}

export interface OrdinanceVote {
  motion: string | null | undefined;
  result: 'passed' | 'failed' | 'tabled';
  itemTitle: string;
}

export interface OrdinanceVoteOutcome {
  /** What to record on the ordinance/meeting link. */
  action: string;
  /** Terminal status to write onto the ordinance, or null to leave it alone. */
  newStatus: string | null;
  /**
   * Whether this reading of the vote is certain enough to outrank a later
   * title-derived guess. False means "recorded, but still open to correction".
   */
  verified: boolean;
}

/**
 * Turn one recorded council vote into an ordinance outcome.
 *
 * The mapping is not mechanical, because a motion's subject matters as much as
 * its result: council moves readings with either "Approve" or "Advance", and a
 * motion to *deny* that fails leaves the ordinance alive rather than failed.
 * Cases that cannot be read confidently fall back to the reading named in the
 * title and are left unverified rather than asserted.
 */
export function resolveOrdinanceVote({ motion, result, itemTitle }: OrdinanceVote): OrdinanceVoteOutcome {
  const reading = classifyReading(itemTitle);
  const readingAction = reading === 'second' ? 'second_reading' : reading === 'first' ? 'first_reading' : 'discussed';
  const normalizedMotion = (motion ?? '').trim().toLowerCase();

  if (result === 'tabled' || (normalizedMotion === 'table' && result === 'passed')) {
    return { action: 'tabled', newStatus: 'tabled', verified: true };
  }

  if (normalizedMotion === 'deny') {
    // A denial that carried ends the ordinance; one that failed does not touch
    // it, so the item is left at whatever reading the title describes.
    return result === 'passed'
      ? { action: 'denied', newStatus: 'denied', verified: true }
      : { action: readingAction, newStatus: null, verified: false };
  }

  if (normalizedMotion === 'approve' || normalizedMotion === 'advance') {
    if (result === 'failed') {
      return { action: 'failed', newStatus: null, verified: true };
    }
    if (reading === 'second') return { action: 'adopted', newStatus: 'adopted', verified: true };
    if (reading === 'first') return { action: 'first_reading', newStatus: null, verified: true };
    // A motion carried on an item that names no reading. Single-reading items
    // (a millage rate, say) are adopted by exactly this vote, but the title
    // alone cannot prove it, so record it without freezing it.
    return { action: 'approved', newStatus: null, verified: false };
  }

  if (result === 'failed') {
    return { action: 'failed', newStatus: null, verified: true };
  }

  // An unrecognised motion type is recorded from the title and left open, so a
  // wording the city has not used before cannot silently freeze a wrong answer.
  return { action: readingAction, newStatus: null, verified: false };
}

export function classifyReading(title: string): 'first' | 'second' | null {
  const normalized = normalizeRefText(title);
  const first = normalized.search(FIRST_READ_MARKER);
  const second = normalized.search(SECOND_READ_MARKER);

  if (first === -1 && second === -1) return null;
  if (first === -1) return 'second';
  if (second === -1) return 'first';
  return first < second ? 'first' : 'second';
}
