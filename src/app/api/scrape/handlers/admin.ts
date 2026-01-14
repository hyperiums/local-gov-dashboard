// Admin scrape handlers (database reset, etc.)
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function handleResetDatabase() {
  // Clear all data from all tables while preserving schema
  console.log('Resetting database - clearing all data...');
  const db = getDb();

  // Delete in order to respect foreign key constraints
  const tables = [
    'ordinance_meetings',
    'agenda_items',
    'attachments',
    'meetings',
    'ordinances',
    'resolutions',
    'permits',
    'summaries',
  ];

  const counts: Record<string, number> = {};
  for (const table of tables) {
    const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
    counts[table] = countResult.count;
    db.prepare(`DELETE FROM ${table}`).run();
    console.log(`  Cleared ${counts[table]} rows from ${table}`);
  }

  return NextResponse.json({
    success: true,
    message: 'All data cleared from database',
    deletedCounts: counts,
  });
}
