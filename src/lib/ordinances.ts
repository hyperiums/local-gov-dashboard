/**
 * Ordinance-specific database queries
 * Extracted from db.ts to keep the codebase modular
 */

import { getDb } from './db';
import type { OrdinanceLifecycleReading } from '@/components/ordinances/types';

// Re-export utilities from the shared types module for server-side code
export { normalizeAction, ACTION_LABELS, STANDARD_ORDINANCE_STEPS } from '@/components/ordinances/types';

export interface OrdinanceLifecycleData {
  id: string;
  number: string;
  title: string;
  status: string;
  adopted_date: string | null;
  municode_url: string | null;
  readings: OrdinanceLifecycleReading[];
}

/**
 * Get complete lifecycle data for an ordinance including all meeting actions
 */
export function getOrdinanceLifecycleData(ordinanceId: string): OrdinanceLifecycleData | null {
  const db = getDb();

  // Get ordinance info
  const ordinance = db.prepare(`
    SELECT id, number, title, status, adopted_date, municode_url
    FROM ordinances
    WHERE id = ?
  `).get(ordinanceId) as {
    id: string;
    number: string;
    title: string;
    status: string;
    adopted_date: string | null;
    municode_url: string | null;
  } | undefined;

  if (!ordinance) {
    return null;
  }

  // Get all readings/actions from ordinance_meetings joined with meetings
  const readings = db.prepare(`
    SELECT
      om.action,
      m.id as meeting_id,
      m.date as meeting_date,
      m.title as meeting_title
    FROM ordinance_meetings om
    JOIN meetings m ON m.id = om.meeting_id
    WHERE om.ordinance_id = ?
    ORDER BY m.date ASC
  `).all(ordinanceId) as OrdinanceLifecycleReading[];

  return {
    ...ordinance,
    readings,
  };
}

/**
 * Get lifecycle data by ordinance number (alternative lookup method)
 */
export function getOrdinanceLifecycleByNumber(ordinanceNumber: string): OrdinanceLifecycleData | null {
  const db = getDb();

  const ordinance = db.prepare(`
    SELECT id FROM ordinances WHERE number = ?
  `).get(ordinanceNumber) as { id: string } | undefined;

  if (!ordinance) {
    return null;
  }

  return getOrdinanceLifecycleData(ordinance.id);
}

