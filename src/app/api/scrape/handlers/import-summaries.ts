// Generic summary-row import for document families whose PDFs the
// production IP cannot fetch (the city's CDN returns 403 to the
// droplet). Summaries are generated on a local machine — where both the
// PDFs and the OpenAI key are available — then shipped here as finished
// rows by scripts/push-summaries.sh. Same ADMIN_SECRET gate as every
// other /api/scrape op.
import { NextResponse } from 'next/server';
import { saveSummary } from '@/lib/db';
import { formatError, type HandlerParams } from './shared';

// Only document families without a prod-native pipeline. Meetings,
// ordinances, resolutions, permits, and businesses have their own ops
// and must not be writable through this side door.
const IMPORTABLE_ENTITY_TYPES = new Set([
  'splost',
  'notice',
  'strategic',
  'water-quality',
  'budget',
  'audit',
]);
const IMPORTABLE_SUMMARY_TYPES = new Set(['pdf-analysis', 'headline', 'brief', 'detailed']);

const MAX_ROWS = 500;
const MAX_CONTENT_LEN = 100_000;
const MAX_ID_LEN = 200;

type SummaryRow = {
  entity_type?: string;
  entity_id?: string;
  summary_type?: string;
  content?: string;
  metadata?: string | null;
};

export async function handleImportSummaries(params: HandlerParams) {
  const rows = (params?.summaries as SummaryRow[] | undefined) || [];
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: 'params.summaries must be an array' }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `too many summaries in one request (max ${MAX_ROWS}, got ${rows.length})` },
      { status: 413 }
    );
  }

  let imported = 0;
  const errors: { entityId?: string; error: string }[] = [];

  for (const row of rows) {
    const { entity_type, entity_id, summary_type, content } = row;
    if (!entity_type || !IMPORTABLE_ENTITY_TYPES.has(entity_type)) {
      errors.push({ entityId: entity_id, error: `entity_type not importable: ${entity_type}` });
      continue;
    }
    if (!summary_type || !IMPORTABLE_SUMMARY_TYPES.has(summary_type)) {
      errors.push({ entityId: entity_id, error: `summary_type not importable: ${summary_type}` });
      continue;
    }
    if (typeof entity_id !== 'string' || !entity_id || entity_id.length > MAX_ID_LEN) {
      errors.push({ entityId: entity_id, error: 'invalid entity_id' });
      continue;
    }
    if (typeof content !== 'string' || !content || content.length > MAX_CONTENT_LEN) {
      errors.push({ entityId: entity_id, error: 'content must be a non-empty string within size limit' });
      continue;
    }

    // Metadata arrives as the JSON string sqlite3 -json emits
    let metadata: Record<string, unknown> | undefined;
    if (row.metadata != null) {
      try {
        const parsed: unknown = JSON.parse(row.metadata);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('metadata must be a JSON object');
        }
        metadata = parsed as Record<string, unknown>;
      } catch (err) {
        errors.push({ entityId: entity_id, error: `invalid metadata: ${formatError(err)}` });
        continue;
      }
    }

    try {
      saveSummary(entity_type, entity_id, summary_type, content, metadata);
      imported++;
    } catch (err) {
      errors.push({ entityId: entity_id, error: formatError(err) });
    }
  }

  return NextResponse.json({
    success: errors.length === 0,
    imported,
    received: rows.length,
    errors,
  });
}
