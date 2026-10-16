/**
 * A published page's address on the GyFTR website the panel publishes to: the page's path on the site set in the
 * settings (GYFTR_BRAND_PAGE_BASE_URL, the site brand cards link to as well), e.g. https://www.gyftr.com/occasion/diwali.
 * Without the setting (still loading), the page's own URL.
 */
export function websiteUrl(pageUrl: string, siteBase: string | undefined): string {
  if (!siteBase) return pageUrl;
  try {
    const page = new URL(pageUrl);
    return `${siteBase.replace(/\/+$/, '')}${page.pathname}${page.search}`;
  } catch {
    return pageUrl;
  }
}
