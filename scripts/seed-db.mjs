#!/usr/bin/env node
/**
 * Put the sample database in place so a fresh clone has something to show.
 *
 * Without this a new contributor sees an empty dashboard, and filling it means
 * both an OpenAI key with real money on it and a full Playwright scrape of the
 * city's portal. Shipping a snapshot means nobody has to load a small city's
 * servers just to see the app run.
 *
 * Refuses to overwrite an existing database — on the production host that file
 * is the live copy, and the seed is months behind it by design.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = join(root, 'data', 'seed.db');
const target = join(root, 'data', 'flowery-branch.db');

if (!existsSync(seed)) {
  console.error(`No seed database at ${seed}`);
  process.exit(1);
}

if (existsSync(target)) {
  console.log('data/flowery-branch.db already exists — leaving it alone.');
  console.log('Delete it first if you want to start again from the sample data.');
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(seed, target);
console.log('Seeded data/flowery-branch.db from the sample database.');
console.log('Run `npm run dev` to browse it, or refresh it against the city with /api/scrape.');
