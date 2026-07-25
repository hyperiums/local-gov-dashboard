/**
 * The OpenAI models this dashboard runs on.
 *
 * Kept in one place because the choice is a civic decision, not just a cost
 * one. Summaries here are what a resident reads instead of sitting through a
 * three-hour meeting, and models differ in whether they preserve how contested
 * a decision was. Measured against real Flowery Branch minutes, gpt-4o-mini
 * reported that an ordinance "was denied" when what actually failed was the
 * motion *to* deny — the opposite outcome. It also flattened split votes into
 * plain approvals, so "council split 3-2" and "the mayor broke a 2-2 tie" never
 * reached the page. gpt-5.6-luna reported both, and read the withdrawal of four
 * ordinances correctly across every trial.
 *
 * A fork on a tighter budget can drop these to a cheaper tier — gpt-5.4-mini
 * was accurate on the same documents at roughly two thirds the cost, and the
 * difference is fractions of a cent per summary either way. Do note that
 * gpt-5.4-nano twice reported adopted ordinances as withdrawn, so the very
 * cheapest tier is not safe for anything a resident will read as fact.
 *
 * Two API details bind any change made here: models in this generation reject
 * `max_tokens` (use `max_completion_tokens`) and reject an explicit
 * `temperature`. Both fail closed with an HTTP 400 rather than degrading.
 */

/** Resident-facing prose: meeting, ordinance, permit, budget and document summaries. */
export const SUMMARY_MODEL = 'gpt-5.6-luna';

/** Structured extraction: agenda items, vote outcomes, figures pulled from PDFs. */
export const EXTRACTION_MODEL = 'gpt-5.6-luna';

/** Models an operator may select per request, e.g. from the admin panel. */
export type ModelOption = 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.4-mini' | 'gpt-5.4-nano';
