// XSS sanitization helper using DOMPurify
import DOMPurify from 'isomorphic-dompurify';

// Configure DOMPurify to allow only safe tags
const ALLOWED_TAGS = ['strong', 'em', 'b', 'i', 'br', 'p', 'span', 'ul', 'li', 'h4'];
const ALLOWED_ATTR = ['class'];

// Operator-authored prose (content/about.md) gets headings and links on top of
// the summary subset. The line that matters is authorship, not trust in the
// markup: a summarizer must never put a clickable destination in front of a
// resident, while the person running the deployment is writing their own page
// and needs to cite sources. Everything still goes through DOMPurify, which
// drops javascript: and data: hrefs.
const PROSE_TAGS = [...ALLOWED_TAGS, 'h2', 'h3', 'a'];
const PROSE_ATTR = [...ALLOWED_ATTR, 'href', 'target', 'rel'];

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

const PROSE_H2_CLASS = 'text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-8 first:mt-0 mb-3';
const PROSE_H3_CLASS = 'text-lg font-semibold text-slate-900 dark:text-slate-100 mt-6 mb-2';
const PROSE_P_CLASS = 'mb-3';
const PROSE_LINK_CLASS = 'text-emerald-600 dark:text-emerald-400 hover:underline';

function proseInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, `<strong class="${BOLD_CLASS}">$1</strong>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
      const external = /^https?:\/\//.test(href);
      const rest = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${href}" class="${PROSE_LINK_CLASS}"${rest}>${label}</a>`;
    });
}

/**
 * Render the operator's own About copy (content/about.md) as safe HTML.
 *
 * The About page keeps the structural disclosures in code, where a deployment
 * can't drop them by accident, and reads the operator's identity, motives, and
 * conflicts from a markdown file instead. That split is what lets another city
 * fork this without editing a component to delete somebody else's biography.
 *
 * Same escape-then-markup order as formatSummaryHtml, and the same DOMPurify
 * pass — the subset is wider, not looser.
 */
export function formatProseHtml(text: string): string {
  if (!text?.trim()) return '';

  const html: string[] = [];
  let listItems: string[] = [];

  const closeList = () => {
    if (listItems.length === 0) return;
    html.push(`<ul class="${LIST_CLASS} mb-3">${listItems.join('')}</ul>`);
    listItems = [];
  };

  // A blank line ends a paragraph; consecutive non-blank lines are one
  // paragraph, so the source file can wrap at a readable width.
  let paragraph: string[] = [];
  const closeParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p class="${PROSE_P_CLASS}">${proseInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    if (!line) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const cls = heading[1].length === 2 ? PROSE_H2_CLASS : PROSE_H3_CLASS;
      const tag = heading[1].length === 2 ? 'h2' : 'h3';
      html.push(`<${tag} class="${cls}">${proseInline(heading[2])}</${tag}>`);
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      closeParagraph();
      listItems.push(`<li>${proseInline(bullet[1])}</li>`);
      continue;
    }

    paragraph.push(line);
  }

  closeParagraph();
  closeList();

  return DOMPurify.sanitize(html.join(''), {
    ALLOWED_TAGS: PROSE_TAGS,
    ALLOWED_ATTR: PROSE_ATTR,
  });
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
