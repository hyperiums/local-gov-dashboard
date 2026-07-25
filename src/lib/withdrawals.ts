/**
 * Find ordinances a council pulled rather than voted on.
 *
 * An item withdrawn by its applicant, or removed when the agenda was adopted,
 * leaves no vote behind — and the portal's structured data never learns it
 * happened, because the agenda was published before the meeting. The only
 * record is the minutes narrative. Without reading it, four ordinances the
 * applicant withdrew on 2026-05-07 sat on the dashboard for months showing a
 * first reading they never received.
 *
 * This is deliberately not a model call. Clerks write withdrawals in set
 * phrases, and a rule that cites the sentence it fired on is cheaper, instant,
 * reproducible, and cannot invent a disposition — which matters more here than
 * flexibility, since the output is presented to residents as fact. Phrasings a
 * rule cannot follow are better left undetected than guessed at.
 */
import { extractOrdinanceNumbers, normalizeRefText } from './ordinanceRefs';

export interface WithdrawnOrdinance {
  number: string;
  /** The sentence from the minutes this was read from, for display and audit. */
  evidence: string;
  /** `stated` names the ordinance outright; `annotated` is a note attached to an item. */
  basis: 'stated' | 'annotated';
}

// "the developer had withdrawn the applications in regard to Ordinances 780,
// 781, 782", "removing Ordinance 780, 781, 782, and 783 from the Public Hearing
// Section" — the ordinances are named in the same breath as the withdrawal.
const STATED = /\b(withdrew|withdrawn|withdrawal|removing)\b/gi;

// Withdrawing a *motion* is ordinary floor procedure and says nothing about the
// ordinance, which usually carries on to a fresh motion moments later. The
// February 2025 minutes read "Council Member McDaniel withdrew the original
// motion to approve the first reading of Ordinance 733", and council then
// adopted 733 — so reading that as a withdrawal would have reported an enacted
// ordinance as pulled.
const PROCEDURAL_OBJECT = /^\W*(?:the\s+|his\s+|her\s+|their\s+|that\s+)?(?:original\s+|previous\s+|prior\s+|first\s+|second\s+)?(?:motion|second|amendment)\b/i;

// "- This item was removed from the agenda." — a note the clerk appends to the
// item itself, naming nothing. It belongs to whatever item it trails.
const ANNOTATED = /\bthis item (?:was|has been) (?:removed from the agenda|withdrawn)\b/gi;

// A reference and everything the sentence attaches to it, so the numbers can be
// pulled with the shared parser rather than a second, drifting pattern.
const REFERENCE_RUN = /ordinances?(?:\s+nos?\.?)?\s+\d[\d\s,/&A-Za-z-]*/gi;

/** How far after a withdrawal statement its ordinance references may sit. */
const STATED_LOOKAHEAD = 180;

function sentenceAround(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf('.', index - 1) + 1);
  const end = text.indexOf('.', index);
  return text.slice(start, end === -1 ? Math.min(text.length, index + 160) : end + 1).trim();
}

export function detectWithdrawnOrdinances(minutesText: string): WithdrawnOrdinance[] {
  // Minutes arrive hard-wrapped from PDF extraction, so a sentence routinely
  // spans line breaks; flattening first lets one pattern span the whole of it.
  const text = normalizeRefText(minutesText).replace(/\s+/g, ' ');
  const found = new Map<string, WithdrawnOrdinance>();

  const record = (number: string, evidence: string, basis: WithdrawnOrdinance['basis']) => {
    // A statement naming the ordinance outranks a note that only sits near it.
    const existing = found.get(number);
    if (existing && !(existing.basis === 'annotated' && basis === 'stated')) return;
    found.set(number, { number, evidence, basis });
  };

  for (const marker of text.matchAll(STATED)) {
    const window = text.slice(marker.index, marker.index + STATED_LOOKAHEAD);
    // What was withdrawn decides whether this matters: a motion is procedure,
    // an application is the item leaving the agenda.
    if (PROCEDURAL_OBJECT.test(window.slice(marker[0].length))) continue;
    for (const run of window.matchAll(REFERENCE_RUN)) {
      for (const number of extractOrdinanceNumbers(run[0])) {
        record(number, sentenceAround(text, marker.index), 'stated');
      }
    }
  }

  for (const marker of text.matchAll(ANNOTATED)) {
    // The note terminates its own item, so the reference that owns it is the
    // nearest one behind it — not every reference in the neighbourhood, which
    // would sweep in the previous item and the lot sizes quoted in between.
    const preceding = [...text.slice(0, marker.index).matchAll(REFERENCE_RUN)];
    const owner = preceding[preceding.length - 1];
    if (!owner) continue;
    const [number] = extractOrdinanceNumbers(owner[0]);
    if (number) record(number, sentenceAround(text, marker.index), 'annotated');
  }

  return [...found.values()].sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
}

/**
 * Record withdrawals found in one meeting's minutes.
 *
 * Only ordinances already linked to this meeting are touched, so a number
 * mentioned in passing cannot create or alter a record elsewhere. An ordinance
 * the council later adopted is left alone: the published code is the stronger
 * evidence, and a withdrawal read here would be describing an earlier attempt.
 */
export function recordWithdrawnOrdinances(
  db: ReturnType<typeof import('./db').getDb>,
  meetingId: string,
  minutesText: string
): WithdrawnOrdinance[] {
  const recorded: WithdrawnOrdinance[] = [];

  for (const finding of detectWithdrawnOrdinances(minutesText)) {
    const ordinance = db.prepare(`
      SELECT o.id, o.status FROM ordinances o
      JOIN ordinance_meetings om ON om.ordinance_id = o.id
      WHERE om.meeting_id = ? AND o.number = ?
    `).get(meetingId, finding.number) as { id: string; status: string } | undefined;

    if (!ordinance) continue;
    if (ordinance.status === 'adopted') continue;

    db.prepare(`
      UPDATE ordinance_meetings
      SET action = 'withdrawn', outcome_verified = 1, evidence = ?
      WHERE meeting_id = ? AND ordinance_id = ?
    `).run(finding.evidence, meetingId, ordinance.id);

    db.prepare(`UPDATE ordinances SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ?`)
      .run(ordinance.id);

    recorded.push(finding);
    console.log(`Ordinance ${finding.number} withdrawn at ${meetingId}: "${finding.evidence.slice(0, 90)}"`);
  }

  return recorded;
}
