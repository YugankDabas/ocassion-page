/** Short random id for new sections / list items (matches the backend's item id format). */
export function newId(prefix = ''): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${prefix}${b64}`;
}
