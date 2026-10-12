import sanitizeHtml from 'sanitize-html';

/**
 * Defence in depth: the admin API already sanitises rich text, but the renderer
 * never trusts upstream HTML. Same allow-list as the API.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark',
    'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'], ol: ['start'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...(attribs.href ? { href: attribs.href } : {}),
        ...(attribs.target === '_blank' ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
      },
    }),
  },
};

export function safeHtml(html: string): string {
  return html ? sanitizeHtml(html, OPTIONS) : '';
}

/** Plain-text version (for meta descriptions / JSON-LD). */
export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}
