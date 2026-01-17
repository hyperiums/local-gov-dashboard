// XSS sanitization helper using DOMPurify
import DOMPurify from 'isomorphic-dompurify';

// Configure DOMPurify to allow only safe tags
const ALLOWED_TAGS = ['strong', 'em', 'b', 'i', 'br', 'p', 'span'];
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
 * Use this for AI-generated summaries that may contain markdown formatting.
 */
export function formatAndSanitize(text: string): string {
  // Convert **text** to <strong>text</strong>
  const withHtml = text.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold text-slate-900 dark:text-slate-100">$1</strong>'
  );
  return sanitizeHtml(withHtml);
}
