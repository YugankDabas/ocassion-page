import { randomBytes } from 'node:crypto';

/** Short, URL-safe id for list items inside page content (sections, FAQs, slides...). */
export function itemId(prefix = ''): string {
  return `${prefix}${randomBytes(6).toString('base64url')}`;
}
