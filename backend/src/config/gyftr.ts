/**
 * Which GyFTR environment the brand library follows: where brands are fetched from (the brand API) and
 * where a brand card links to (the brand's page on the GyFTR site).
 *
 * Set by GYFTR_API_URL and GYFTR_BRAND_PAGE_BASE_URL (.env locally, the Secrets Manager secret when deployed).
 * A setting left out is chosen from the panel's own address: a panel on *.gyftr.net (staging) or localhost
 * follows GyFTR staging, any other panel production.
 */
export interface GyftrTarget {
  environment: 'production' | 'staging';
  /** Brand API base, e.g. https://api.gyftr.com/gyftrapi/api/v1 (…/home/brand/list, …/brand/detail/:slug). */
  apiBase: string;
  /** The API's host: recorded on each synced brand, since GyFTR ids are only unique within one API. */
  source: string;
  /** Brand pages are `${brandPageBase}/${slug}`, e.g. https://www.gyftr.com/amazon. */
  brandPageBase: string;
  /** Whether both came from the settings, or (some) from the panel's address. */
  configuredBy: 'settings' | 'panel address';
}

export const GYFTR_ENVIRONMENTS = {
  production: { apiBase: 'https://api.gyftr.com/gyftrapi/api/v1', brandPageBase: 'https://www.gyftr.com' },
  staging: { apiBase: 'https://gyftrapi.gyftr.net/gyftrapi/api/v1', brandPageBase: 'https://www.gvhelpdesk.net' },
} as const;

const trimSlash = (url: string) => url.replace(/\/+$/, '');

export function gyftrTarget(env: { ADMIN_FRONTEND_ORIGIN: string; GYFTR_API_URL?: string; GYFTR_BRAND_PAGE_BASE_URL?: string }): GyftrTarget {
  const host = new URL(env.ADMIN_FRONTEND_ORIGIN).hostname;
  const byAddress = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.gyftr.net') ? 'staging' : 'production';
  const apiBase = trimSlash(env.GYFTR_API_URL ?? GYFTR_ENVIRONMENTS[byAddress].apiBase);
  // The environment is the one the brand API belongs to (a set API decides it), for the panel's labels.
  const environment = apiBase === GYFTR_ENVIRONMENTS.production.apiBase ? 'production' : apiBase === GYFTR_ENVIRONMENTS.staging.apiBase ? 'staging' : byAddress;
  return {
    environment,
    apiBase,
    source: new URL(apiBase).host,
    brandPageBase: trimSlash(env.GYFTR_BRAND_PAGE_BASE_URL ?? GYFTR_ENVIRONMENTS[environment].brandPageBase),
    configuredBy: env.GYFTR_API_URL && env.GYFTR_BRAND_PAGE_BASE_URL ? 'settings' : 'panel address',
  };
}
