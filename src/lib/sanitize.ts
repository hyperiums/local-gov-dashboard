// XSS sanitization helper using DOMPurify
import DOMPurify from 'isomorphic-dompurify';

// Configure DOMPurify to allow only safe tags
const ALLOWED_TAGS = ['strong', 'em', 'b', 'i', 'br', 'p', 'span', 'ul', 'li', 'h4'];
const ALLOWED_ATTR = ['class'];

/**
 * Sanitize HTML content to prevent XSS attacks.
 * Only allows safe formatting tags (strong, em, etc.).
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  });
}

/**
 * Convert markdown-style bold (**text**) to HTML and sanitize.
 * Use this for a single line or fragment. Whole summaries should go through
 * formatSummaryHtml, which also understands headings and lists.
 */
export function formatAndSanitize(text: string): string {
  // Convert **text** to <strong>text</strong>
  const withHtml = text.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold text-slate-900 dark:text-slate-100">$1</strong>'
  );
  return sanitizeHtml(withHtml);
}

const HEADING_CLASS = 'font-semibold text-slate-900 dark:text-slate-100 mt-3 first:mt-0';
const LIST_CLASS = 'list-disc pl-5 space-y-1';
const BOLD_CLASS = 'font-semibold text-slate-900 dark:text-slate-100';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, `<strong class="${BOLD_CLASS}">$1</strong>`);
}

/**
 * Render a whole AI summary as safe HTML.
 *
 * The summarization prompts ask for markdown — a heading per section, bullets
 * beneath — but rendering only ever converted bold, so residents were shown
 * literal "## What it does" and "- " markers on the page.
 *
 * The subset is deliberately small: headings, bullets, paragraphs, bold. Every
 * construct accepted here is one more thing that has to be safe to place on a
 * public page from machine-written text. Links stay as plain text in
 * particular — a summarizer should never put a clickable destination in front
 * of a resident. Text is escaped before any markup is added, and the result
 * still goes through DOMPurify.
 */
export function formatSummaryHtml(text: string): string {
  if (!text?.trim()) return '';

  const html: string[] = [];
  let listItems: string[] = [];

  const closeList = () => {
    if (listItems.length === 0) return;
    html.push(`<ul class="${LIST_CLASS}">${listItems.join('')}</ul>`);
    listItems = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      closeList();
      // Summaries sit inside sections that already own the page's larger
      // headings, so every level renders at the same modest size.
      html.push(`<h4 class="${HEADING_CLASS}">${inline(heading[1])}</h4>`);
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      listItems.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  return sanitizeHtml(html.join(''));
}

/**
 * Flatten a summary to plain text for previews and snippets.
 *
 * Collapsed cards clamp a summary to a line or two, where markup would only get
 * in the way — but stripping bold alone left "## What it does" as the opening
 * words of the preview. Newlines collapse to spaces so a clamped line reads as
 * a sentence rather than a stack of fragments.
 */
export function summaryToPlainText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
}
