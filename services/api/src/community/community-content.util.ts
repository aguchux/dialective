import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';

// COMMUNITY-PLAN.md §42: bold, italic, links, lists, quotes, code -- no
// arbitrary HTML. Markdown is rendered to HTML first (marked), then stripped
// down to exactly this allowlist (sanitize-html) before storage -- storing
// sanitized HTML rather than raw Markdown means a render-time XSS bug can
// never resurface from old content once the sanitizer itself is fixed.
const ALLOWED_TAGS = ['strong', 'b', 'em', 'i', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'p', 'br'];
const sanitizeOptions: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
  },
};

marked.setOptions({ breaks: true, gfm: true });

/** Renders trusted-shape Markdown to a strict, storage-safe HTML subset. */
export function renderCommunityBody(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(html, sanitizeOptions);
}
