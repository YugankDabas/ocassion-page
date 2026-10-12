import sanitizeHtml from 'sanitize-html';

export interface IHtmlSanitizer {
  sanitize(dirty: string): string;
}

/**
 * Allow-list based HTML sanitiser for editor-authored rich text.
 * No scripts, styles, event handlers, iframes or unsafe URL schemes survive.
 */
export class HtmlSanitizer implements IHtmlSanitizer {
  private readonly options: sanitizeHtml.IOptions = {
    allowedTags: [
      'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark',
      'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'code',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      ol: ['start'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
    transformTags: {
      a: (tagName, attribs) => {
        const external = attribs.target === '_blank';
        return {
          tagName,
          attribs: {
            ...(attribs.href ? { href: attribs.href } : {}),
            ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          },
        };
      },
      h1: 'h2',
    },
  };

  sanitize(dirty: string): string {
    if (!dirty) return '';
    return sanitizeHtml(dirty, this.options).trim();
  }
}
