import { fetchVoteOutcomesFromOverview } from '../src/lib/scraper/index.ts';

const eventId = parseInt(process.argv[2] || '109');
console.log('Fetching vote outcomes for event ' + eventId + '...');

try {
  const outcomes = await fetchVoteOutcomesFromOverview(eventId);
  console.log('\n=== VOTE OUTCOMES ===');
  for (const outcome of outcomes) {
    console.log('\nItem: ' + outcome.itemTitle.slice(0, 100));
    console.log('  Motion: ' + outcome.motion);
    console.log('  Result: ' + outcome.result);
    console.log('  Vote: ' + outcome.yesCount + '-' + outcome.noCount);
  }
  console.log('\n=== ORDINANCES ===');
  const ordinances = [];
  for (const outcome of outcomes) {
    const ordMatch = outcome.itemTitle.match(/Ordinance\s+(\d+)/i);
    if (ordMatch) {
      console.log('Ordinance ' + ordMatch[1] + ': ' + outcome.result);
      ordinances.push({ number: ordMatch[1], result: outcome.result });
    }
  }
  // Output JSON for parsing
  console.log('\n=== JSON ===');
  console.log(JSON.stringify(ordinances));
} catch (e) {
  console.error('Error:', e.message);
}
