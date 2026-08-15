import { describe, it, expect } from 'vitest';
import { cityName, operatorName, operatorDisclosure } from '@/lib/city-config-client';

// This site carries a city's name on every page, so the default reading is that
// the city publishes it. The disclosure is the correction, and it is the one
// string on the site that is load-bearing for honesty rather than for content:
// it renders above the masthead, in the footer, in the page description, and on
// the link-preview card. A deployment that edits it down to a project tagline
// creates exactly the confusion it exists to prevent, so the invariants are
// asserted rather than left to review.

describe('operator disclosure', () => {
  it('names the person who publishes the site', () => {
    expect(operatorName.trim().length).toBeGreaterThan(0);
    expect(operatorDisclosure).toContain(operatorName);
  });

  it('denies that the city publishes it', () => {
    expect(operatorDisclosure).toMatch(/\bnot\b/i);
    expect(operatorDisclosure).toContain(cityName);
  });

  it('stays short enough to read above the fold on a phone', () => {
    expect(operatorDisclosure.length).toBeLessThanOrEqual(120);
  });
});
