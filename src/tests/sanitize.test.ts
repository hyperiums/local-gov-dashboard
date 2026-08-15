import { describe, it, expect } from 'vitest';
import { formatSummaryHtml, formatAndSanitize, formatProseHtml, sanitizeHtml, summaryToPlainText } from '@/lib/sanitize';

// The shape the summarization prompts actually ask for, taken from a live
// ordinance summary that rendered its markers as literal text on the page.
const REAL_SUMMARY = `## What it does

This ordinance amends the Zoning Ordinance to define "Mixed-Use Residential Over Business" (MU-ROB).

## Who it affects

- Property owners and developers proposing MU-ROB development.
- Properties within the **Central Business District** (CBD).`;

describe('formatSummaryHtml', () => {
  it('renders headings as elements rather than literal hashes', () => {
    const html = formatSummaryHtml(REAL_SUMMARY);
    expect(html).toContain('<h4');
    expect(html).toContain('What it does');
    expect(html).not.toContain('## ');
  });

  it('renders bullets as a list rather than literal dashes', () => {
    const html = formatSummaryHtml(REAL_SUMMARY);
    expect(html).toContain('<ul');
    expect(html).toContain('<li>Property owners and developers proposing MU-ROB development.</li>');
    expect(html).not.toMatch(/^- /m);
  });

  it('keeps bold inside list items', () => {
    expect(formatSummaryHtml('- Within the **Central Business District**.')).toContain('<strong');
  });

  it('accepts the bullet characters the summarizer actually emits', () => {
    for (const marker of ['-', '*', '•']) {
      expect(formatSummaryHtml(`${marker} An item`)).toContain('<li>An item</li>');
    }
  });

  it('closes a list before the next heading', () => {
    const html = formatSummaryHtml('- one\n- two\n\n## Next section\n\nProse.');
    expect(html.indexOf('</ul>')).toBeLessThan(html.indexOf('<h4'));
  });

  it('returns nothing for empty input', () => {
    expect(formatSummaryHtml('')).toBe('');
    expect(formatSummaryHtml('   \n  ')).toBe('');
  });

  // Summaries are machine-written from documents this project does not control,
  // so the renderer is treated as handling untrusted input.
  describe('untrusted content', () => {
    it('does not execute injected script tags', () => {
      const html = formatSummaryHtml('## Hi\n\n<script>alert(1)</script>');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('alert(1)</script>');
    });

    // Escaping beats stripping here: the tag never becomes an element at all,
    // so the handler survives only as visible characters with nothing to fire on.
    it('renders an injected tag as inert text rather than an element', () => {
      const html = formatSummaryHtml('<img src=x onerror="alert(1)">');
      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    });

    it('does not turn a markdown link into a clickable destination', () => {
      const html = formatSummaryHtml('- See [the site](https://example.com/phish) for details');
      expect(html).not.toContain('<a');
      expect(html).not.toContain('href');
    });

    it('renders angle brackets in prose as text, not markup', () => {
      const html = formatSummaryHtml('Lots under <span> 3,500 square feet are exempt.');
      expect(html).toContain('&lt;span&gt;');
    });

    it('leaves a javascript: url with no anchor to attach to', () => {
      const html = formatSummaryHtml('<a href="javascript:alert(1)">click</a>');
      // The text is escaped, so href= survives only as characters — there is
      // no anchor element for a browser to navigate.
      expect(html).not.toContain('<a ');
      expect(html).toContain('&lt;a href=');
    });
  });
});

describe('formatAndSanitize', () => {
  it('still converts bold for single-line callers', () => {
    expect(formatAndSanitize('**Total Count**: 12')).toContain('<strong');
  });

  it('still strips scripts', () => {
    expect(formatAndSanitize('<script>alert(1)</script>')).not.toContain('<script');
  });
});

describe('sanitizeHtml', () => {
  it('permits the formatting tags summaries need', () => {
    expect(sanitizeHtml('<ul><li>a</li></ul>')).toContain('<li>');
    expect(sanitizeHtml('<h4>Section</h4>')).toContain('<h4>');
  });

  it('drops tags outside the allowlist', () => {
    expect(sanitizeHtml('<iframe src="x"></iframe>')).not.toContain('iframe');
  });
});

describe('summaryToPlainText', () => {
  it('drops heading and bullet markers, not just bold', () => {
    const text = summaryToPlainText(REAL_SUMMARY);
    expect(text.startsWith('What it does')).toBe(true);
    expect(text).not.toContain('##');
    expect(text).not.toMatch(/(^|\s)- /);
    expect(text).not.toContain('**');
  });

  it('collapses newlines so a clamped preview reads as a sentence', () => {
    expect(summaryToPlainText('## Title\n\nBody text.')).toBe('Title Body text.');
  });

  it('handles empty input', () => {
    expect(summaryToPlainText('')).toBe('');
  });
});

// content/about.md is operator-authored, so the prose renderer allows links and
// page-level headings that machine-written summaries deliberately don't get.
// Wider is not looser: the file is still untrusted input to the renderer, and a
// deployment that pastes something careless into it must not get script into a
// public page.
describe('formatProseHtml', () => {
  it('renders headings, paragraphs, and inline links', () => {
    const html = formatProseHtml(
      '## Why it exists\n\nI built it. The rules are [open source](https://example.org/prompts).'
    );
    expect(html).toContain('<h2');
    expect(html).toContain('Why it exists');
    expect(html).toContain('href="https://example.org/prompts"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('## ');
  });

  it('joins wrapped lines into one paragraph and splits on blank lines', () => {
    const html = formatProseHtml('First line\nwrapped here.\n\nSecond paragraph.');
    expect(html).toContain('First line wrapped here.');
    expect(html.match(/<p/g)).toHaveLength(2);
  });

  it('keeps same-page links free of target="_blank"', () => {
    expect(formatProseHtml('See [the meetings page](/meetings).')).not.toContain('target');
  });

  // Same escape-then-markup order as summaries: an injected tag never becomes
  // an element, so its handler survives only as visible characters.
  it('renders injected tags as inert text rather than elements', () => {
    const html = formatProseHtml('Hello <script>alert(1)</script> <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
  });

  it('drops a javascript: url from a markdown link', () => {
    const html = formatProseHtml('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('handles empty input', () => {
    expect(formatProseHtml('')).toBe('');
    expect(formatProseHtml('   \n  ')).toBe('');
  });
});
