// Shared utilities for scrape handlers
import { extractText } from 'unpdf';
import { getDb } from '@/lib/db';

export async function parsePdf(buffer: Buffer): Promise<{ text: string }> {
  try {
    const uint8Array = new Uint8Array(buffer);
    const result = await extractText(uint8Array);
    // extractText returns { text: string[] } - join pages together
    const text = Array.isArray(result.text) ? result.text.join('\n') : result.text;
    return { text };
  } catch (error) {
    console.error('PDF parsing error:', error);
    return { text: '' };
  }
}

// Common response type for handlers
export type HandlerParams = Record<string, unknown>;

// Shared validation for month-keyed PDF imports (permits, businesses)
export const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// Cap on base64 PDF size accepted per month. Real monthly PDFs from
// Flowery Branch are ~80-225KB binary, so 5MB is a comfortable ceiling
// that still bounds memory.
export const MAX_PDF_BASE64_BYTES = 5 * 1024 * 1024;

// Format error message consistently across handlers
export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Check if a summary already exists in the database
export function hasSummary(
  entityType: string,
  entityId: string,
  summaryType: string = 'pdf-analysis'
): boolean {
  const db = getDb();
  const existing = db
    .prepare(
      'SELECT 1 FROM summaries WHERE entity_type = ? AND entity_id = ? AND summary_type = ?'
    )
    .get(entityType, entityId, summaryType);
  return !!existing;
}

// Extract CivicClerk event ID from meeting ID (e.g., "civicclerk-123" -> 123)
export function extractEventId(meetingId: string): number | null {
  const match = meetingId.match(/civicclerk-(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Get meeting status based on date
export function getMeetingStatus(dateString: string): 'upcoming' | 'past' {
  return new Date(dateString) > new Date() ? 'upcoming' : 'past';
}
