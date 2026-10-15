import type { CSSProperties } from 'react';
import type { SiteSettings } from '../../contracts';
import { Icon, ItemIcon } from './icons';
import { SmartLink } from './primitives';

/** Splits "https://www.gyftr.com/search?q=" into a GET form action + field name (works without JS). */
function searchForm(searchUrl: string): { action: string; field: string; hidden: [string, string][] } | null {
  try {
    const url = new URL(searchUrl);
    const params = [...url.searchParams.entries()];
    const field = params.length ? params[params.length - 1]![0] : 'q';
    return { action: `${url.origin}${url.pathname}`, field, hidden: params.slice(0, -1) };
  } catch {
    return null;
  }
}

/** Bundled GyFTR logos (data URIs), used when no logo is set in the panel. */
export interface ChromeLogos {
  header: string;
  footer: string;
}

export function SiteHeader({ site, logos }: { site: SiteSettings; logos: ChromeLogos }) {
  const h = site.header;
  const search = searchForm(h.searchUrl);
  return (
    <>
      {h.announcement && (
        <div className="announce">
          <div className="container announce-row">
            <span>
              <Icon name="sparkles" size={14} /> {h.announcement}
            </span>
            {h.voucherStatusUrl && h.voucherStatusLabel && (
              <a href={h.voucherStatusUrl} className="announce-link">
                <Icon name="ticket" size={14} /> {h.voucherStatusLabel}
              </a>
            )}
          </div>
        </div>
      )}
      <header className="site-header">
        <div className="container header-row">
          <a href={h.homeUrl} className="logo" aria-label="GyFTR home">
            <img src={h.logoUrl || logos.header} alt="GyFTR" className="logo-img" />
          </a>
          {search && (
            <form className="header-search" action={search.action} method="get" role="search">
              {search.hidden.map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <Icon name="search" size={18} className="header-search-icon" />
              <label htmlFor="site-search" className="sr-only">
                {h.searchPlaceholder || 'Search'}
              </label>
              <input id="site-search" name={search.field} type="search" placeholder={h.searchPlaceholder} autoComplete="off" />
              {h.searchButtonLabel && <button type="submit">{h.searchButtonLabel}</button>}
            </form>
          )}
          <nav className="header-actions" aria-label="Account">
            {h.loginUrl.href && (
              <a href={h.loginUrl.href} className="login-btn">
                <Icon name="user" size={18} />
                {h.loginUrl.label && <span>{h.loginUrl.label}</span>}
              </a>
            )}
            {h.cartUrl && (
              <a href={h.cartUrl} aria-label="Cart" className="cart-btn">
                <Icon name="cart" size={22} />
              </a>
            )}
          </nav>
        </div>
        {h.links.length > 0 && (
          <nav className="category-nav" aria-label="Categories">
            <div className="container">
              <ul>
                {h.links.map((l) => (
                  <li key={`${l.label}${l.href}`}>
                    <SmartLink href={l.href}>{l.label}</SmartLink>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        )}
      </header>
    </>
  );
}

export function SiteFooter({ site, logos }: { site: SiteSettings; logos: ChromeLogos }) {
  const f = site.footer;
  return (
    <footer className="site-footer">
      <div className="container">
        <ul className="footer-promises" style={{ '--cols': Math.max(1, f.promises.length) } as CSSProperties}>
          {f.promises.map((p) => (
            <li key={p.id}>
              <span className="footer-promise-icon">
                <ItemIcon item={p} size={20} />
              </span>
              {(p.title || p.text) && (
                <span>
                  {p.title && <strong>{p.title}</strong>}
                  {p.text && <small>{p.text}</small>}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="footer-main">
          <div className="footer-brand">
            <img src={f.logoUrl || logos.footer} alt="GyFTR — Happiness Delivered. Instantly." className="footer-logo" loading="lazy" />
            {f.tagline && <p>{f.tagline}</p>}
          </div>
          <div className="footer-cols">
            {f.columns.map((c) => (
              <div key={c.title}>
                <h2>{c.title}</h2>
                <ul>
                  {c.links.map((l) => (
                    <li key={`${l.label}${l.href}`}>
                      <SmartLink href={l.href}>{l.label}</SmartLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        {f.copyright && <p className="copyright">{f.copyright}</p>}
      </div>
    </footer>
  );
}

export function Breadcrumb({ homeUrl, label, labels }: { homeUrl: string; label: string; labels: SiteSettings['labels'] }) {
  return (
    <nav className="breadcrumb container" aria-label="Breadcrumb">
      <ol>
        {labels.breadcrumbHome && (
          <li>
            <a href={homeUrl}>{labels.breadcrumbHome}</a>
          </li>
        )}
        {labels.breadcrumbParent && (
          <li>
            <span>{labels.breadcrumbParent}</span>
          </li>
        )}
        <li aria-current="page">{label}</li>
      </ol>
    </nav>
  );
}
