/**
 * An address for url(...) in an inline style (a background image set in the panel): the characters that could
 * end or break it (spaces, brackets, quotes, backslashes) are percent-encoded, so the style stays intact and the
 * HTML stays JSON-safe (no double quotes or backslashes). encodeURIComponent is not enough: it keeps ( ) and '.
 */
export function cssUrl(url: string): string {
  return url.replace(/[\s()'"\\]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}
