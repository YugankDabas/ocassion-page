/**
 * The published HTML is copied by the gyftr.com backend into its own JSON responses. JSON has to
 * escape exactly three kinds of characters: double quotes, backslashes and control characters
 * (line breaks, tabs). The published HTML contains none of them, so it reads the same inside JSON
 * as outside it: there is nothing to unescape, whatever the receiving code does.
 *
 * The page is unchanged: attributes use single quotes, line breaks become spaces, and a quote or
 * backslash in text becomes its HTML entity.
 */
const CONTROL_CHARS = /[\u0000-\u001f]+/g;
const CONTROL_RUN = /\s*[\u0000-\u001f]\s*/g;

/** True when JSON would write the text as it is. */
export const isJsonSafe = (text: string): boolean => !/["\\\u0000-\u001f]/.test(text);

/** Styles: one line, single-quoted strings, quotes inside data: URLs percent-encoded. */
export function jsonSafeCss(css: string): string {
  return css
    .replace(CONTROL_RUN, ' ')
    .replace(/url\("([^"]*)"\)/g, (_m, url: string) => `url('${url.replace(/'/g, '%27')}')`)
    .replace(/"([^"'\\]*)"/g, "'$1'");
}

/** Markup: attributes in single quotes; a double quote or backslash in text as its HTML entity; one line. */
export function jsonSafeMarkup(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, (tag) => tag.replace(/="([^"]*)"/g, (_m, value: string) => `='${value.replace(/'/g, '&#39;')}'`))
    .replace(/"/g, '&quot;')
    .replace(/\\/g, '&#92;')
    .replace(CONTROL_CHARS, ' ');
}

/** Script: one line. Its source is written without double quotes, backslashes or line comments. */
export function jsonSafeScript(js: string): string {
  if (/["\\]|\/\/\s/.test(js)) throw new Error('The page script must not contain double quotes, backslashes or // comments');
  return js.replace(CONTROL_RUN, ' ').trim();
}
