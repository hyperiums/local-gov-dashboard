// Ordinance-meeting linking and inference utilities
import { getDb } from '../db';

// Infer first_reading and adopted actions from chronological "discussed" sequences
// This handles cases where the city uses "Consider Ordinance X" without explicit reading keywords
// Pass ordinanceNumber to test on a single ordinance before running on all
export function inferReadingsFromDiscussed(ordinanceNumber?: string): { updated: number; ordinances: string[] } {
  const db = getDb();
  const result = { updated: 0, ordinances: [] as string[] };

  // Find ordinances with ONLY 'discussed' actions (no explicit readings)
  // Optionally filter to a single ordinance for testing
  const baseQuery = `
    SELECT DISTINCT om.ordinance_id, o.number, o.status, o.adopted_date
    FROM ordinance_meetings om
    JOIN ordinances o ON o.id = om.ordinance_id
    WHERE om.action = 'discussed'
    AND NOT EXISTS (
      SELECT 1 FROM ordinance_meetings om2
      WHERE om2.ordinance_id = om.ordinance_id
      AND om2.action != 'discussed'
    )
  `;

  const ordinancesWithDiscussed = ordinanceNumber
    ? db.prepare(baseQuery + ' AND o.number = ?').all(ordinanceNumber) as { ordinance_id: string; number: string; status: string; adopted_date: string | null }[]
    : db.prepare(baseQuery).all() as { ordinance_id: string; number: string; status: string; adopted_date: string | null }[];

  console.log(`Found ${ordinancesWithDiscussed.length} ordinances with only 'discussed' actions`);

  for (const ord of ordinancesWithDiscussed) {
    const meetings = db.prepare(`
      SELECT om.meeting_id, m.date
      FROM ordinance_meetings om
      JOIN meetings m ON m.id = om.meeting_id
      WHERE om.ordinance_id = ?
      ORDER BY m.date ASC
    `).all(ord.ordinance_id) as { meeting_id: string; date: string }[];

    if (meetings.length >= 2) {
      // First meeting → first_reading
      db.prepare(`UPDATE ordinance_meetings SET action = 'first_reading' WHERE ordinance_id = ? AND meeting_id = ?`)
        .run(ord.ordinance_id, meetings[0].meeting_id);

      // Second meeting → adopted ONLY if verified by Municode
      if (ord.status === 'adopted' && ord.adopted_date) {
        const meetingDate = new Date(meetings[1].date);
        const adoptedDate = new Date(ord.adopted_date);
        const daysDiff = Math.abs(meetingDate.getTime() - adoptedDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysDiff <= 7) {
          db.prepare(`UPDATE ordinance_meetings SET action = 'adopted' WHERE ordinance_id = ? AND meeting_id = ?`)
            .run(ord.ordinance_id, meetings[1].meeting_id);
          result.updated += 2;
          console.log(`Inferred readings for Ord ${ord.number}: first_reading → adopted`);
        } else {
          // Date mismatch - just mark first reading, leave second as discussed
          result.updated += 1;
          console.log(`Inferred first_reading for Ord ${ord.number} (date mismatch for adoption: meeting ${meetings[1].date} vs adopted ${ord.adopted_date})`);
        }
      } else {
        // Not verified as adopted - just mark first reading
        result.updated += 1;
        console.log(`Inferred first_reading for Ord ${ord.number} (not verified as adopted)`);
      }
      result.ordinances.push(ord.number);
    } else if (meetings.length === 1) {
      // Single meeting → first_reading
      db.prepare(`UPDATE ordinance_meetings SET action = 'first_reading' WHERE ordinance_id = ? AND meeting_id = ?`)
        .run(ord.ordinance_id, meetings[0].meeting_id);
      result.updated += 1;
      result.ordinances.push(ord.number);
      console.log(`Inferred first_reading for Ord ${ord.number} (single meeting)`);
    }
  }

  console.log(`Inference complete: ${result.updated} actions updated for ${result.ordinances.length} ordinances`);
  return result;
}
