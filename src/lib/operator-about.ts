import { readFileSync } from 'fs';
import path from 'path';
import { formatProseHtml } from './sanitize';

const ABOUT_PATH = path.join(process.cwd(), 'content', 'about.md');

/**
 * The operator's own words for /about, kept out of the components so a fork
 * edits a markdown file rather than deleting somebody else's biography from a
 * React component.
 *
 * A missing or empty file throws instead of rendering a shorter page. The one
 * thing /about exists to do is say who publishes this site, and a deployment
 * that quietly serves that page without an author is worse than one that fails
 * to build.
 */
export function getOperatorAboutHtml(): string {
  let markdown: string;
  try {
    markdown = readFileSync(ABOUT_PATH, 'utf8');
  } catch {
    throw new Error(
      `content/about.md is missing. It holds the operator's section of /about — who runs this deployment and why. Create it before building.`
    );
  }

  const html = formatProseHtml(markdown);
  if (!html) {
    throw new Error('content/about.md is empty. /about must name whoever publishes this site.');
  }
  return html;
}
