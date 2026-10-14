import { renderToStaticMarkup } from 'react-dom/server';
import type { HeadingFont, PageRenderData } from '../contracts';
import { loadRenderAssets, type RenderAssets } from './assets';
import { OccasionPage } from './components/OccasionPage';
import { prefixClasses, transformCss } from './css';
import { jsonSafeCss, jsonSafeMarkup, jsonSafeScript } from './jsonSafe';
import { exportRuntime } from './runtime';
import { buildBanner, buildSeo, serializeJsonLd, type PageBanner, type PageSeo } from './seo';

/** Every class in embedded markup carries this prefix, so the host site's CSS (Bootstrap, …) can never match it. */
const CLASS_PREFIX = 'occ-';
const ROOT_CLASS = 'occasion';
const SCOPE = `.${CLASS_PREFIX}${ROOT_CLASS}`;

/** Header / footer rules: never shipped in embedded HTML, which has no chrome. */
const CHROME_SELECTOR = /^\.(?:announce|site-header|header-|logo|login-btn|cart-btn|category-nav|breadcrumb|site-footer|footer-|copyright|skip-link)/;

/**
 * Isolation from the host page, in both directions: the root starts from
 * browser defaults instead of inheriting the host's typography, and every rule
 * that follows is confined to the root (see transformCss).
 */
const EMBED_RESET = `${SCOPE}{all:initial;display:block}`;
const EMBED_OVERRIDES = `${SCOPE}{min-height:0}`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Text placed inside <style> / <script> must not be able to close the tag. */
const inlineSafe = (text: string, tag: 'style' | 'script') => text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

/** Lets the admin panel drive the preview iframe: scroll to the section being edited and keep the scroll position across re-renders. */
const PREVIEW_BRIDGE = `(function () {
  function post(message) { if (window.parent !== window) window.parent.postMessage(message, '*'); }
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || !event.data) return;
    if (event.data.type === 'occasion-preview:scroll') {
      var el = document.querySelector('[data-section-id="' + String(event.data.sectionId).replace(/[^A-Za-z0-9_-]/g, '') + '"]');
      if (el) el.scrollIntoView({ behavior: event.data.instant ? 'auto' : 'smooth', block: 'start' });
    } else if (event.data.type === 'occasion-preview:restore') {
      window.scrollTo(0, Number(event.data.y) || 0);
    }
  });
  var timer;
  window.addEventListener('scroll', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { post({ type: 'occasion-preview:position', y: window.scrollY }); }, 100);
  }, { passive: true });
  document.addEventListener('click', function (event) {
    var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (link && link.getAttribute('href').charAt(0) !== '#') event.preventDefault(); // links are inert in the editor preview
  });
  post({ type: 'occasion-preview:ready' });
})();`;

export interface RenderedFragment {
  /**
   * Ready to insert: `<style>` + markup + `<script>`. No <html>, <head>, header or footer, and no
   * double quotes, backslashes or line breaks, so it reads the same inside JSON.
   */
  html: string;
  seo: PageSeo;
  banner: PageBanner;
  /** Every image URL the markup references (for validation before publishing). */
  images: string[];
}

export interface DocumentOptions {
  /** Include the GyFTR header, breadcrumb and footer. */
  chrome: boolean;
  /** Add the editor-preview bridge and keep the page out of search engines. */
  preview?: boolean;
}

export interface IPageRenderer {
  renderFragment(data: PageRenderData, pageUrl: string): RenderedFragment;
  renderDocument(data: PageRenderData, pageUrl: string, options: DocumentOptions): string;
}

/**
 * Turns page content into HTML. Pure and synchronous: the same content always
 * gives the same output, and nothing here touches the network or the database.
 */
export class PageRenderer implements IPageRenderer {
  private readonly embedCss = new Map<HeadingFont, string>();
  private readonly embedJs = jsonSafeScript(exportRuntime(CLASS_PREFIX));
  private readonly documentJs = exportRuntime('');

  constructor(private readonly assets: RenderAssets = loadRenderAssets()) {}

  renderFragment(data: PageRenderData, pageUrl: string): RenderedFragment {
    const markup = renderToStaticMarkup(<OccasionPage data={data} mode="fragment" chrome={false} logos={this.logos()} />);
    const body = prefixClasses(markup, CLASS_PREFIX);
    const css = this.cssForEmbed(data.content.theme.headingFont);
    return {
      // No double quotes, backslashes or line breaks: the HTML reads the same inside a JSON response (jsonSafe.ts).
      html: `<style>${inlineSafe(css, 'style')}</style>${jsonSafeMarkup(body)}<script>${inlineSafe(this.embedJs, 'script')}</script>`,
      seo: buildSeo(data, pageUrl),
      banner: buildBanner(data, pageUrl),
      images: imageUrls(body),
    };
  }

  renderDocument(data: PageRenderData, pageUrl: string, options: DocumentOptions): string {
    const seo = buildSeo(data, pageUrl);
    const body = renderToStaticMarkup(<OccasionPage data={data} mode="document" chrome={options.chrome} logos={this.logos()} />);
    const css = this.assets.fontCss(data.content.theme.headingFont) + this.assets.pageCss;
    const robots = options.preview || seo.noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
    const head = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${esc(seo.title)}</title>`,
      `<meta name="description" content="${esc(seo.description)}">`,
      seo.keywords ? `<meta name="keywords" content="${esc(seo.keywords)}">` : '',
      `<meta name="robots" content="${robots}">`,
      `<link rel="canonical" href="${esc(seo.canonicalUrl)}">`,
      '<meta property="og:type" content="website">',
      '<meta property="og:site_name" content="GyFTR">',
      `<meta property="og:title" content="${esc(seo.title)}">`,
      `<meta property="og:description" content="${esc(seo.description)}">`,
      `<meta property="og:url" content="${esc(seo.canonicalUrl)}">`,
      seo.ogImage ? `<meta property="og:image" content="${esc(seo.ogImage)}">` : '',
      `<meta name="twitter:card" content="${seo.ogImage ? 'summary_large_image' : 'summary'}">`,
      `<style>${inlineSafe(css, 'style')}</style>`,
    ].filter(Boolean);
    const scripts = [
      ...seo.jsonLd.map((item) => `<script type="application/ld+json">${serializeJsonLd(item)}</script>`),
      `<script>${inlineSafe(this.documentJs, 'script')}</script>`,
      options.preview ? `<script>${inlineSafe(PREVIEW_BRIDGE, 'script')}</script>` : '',
    ].filter(Boolean);
    return `<!doctype html>\n<html lang="en-IN">\n<head>\n${head.join('\n')}\n</head>\n<body>\n<a href="#main" class="skip-link">Skip to content</a>\n${body}\n${scripts.join('\n')}\n</body>\n</html>\n`;
  }

  private logos() {
    return { header: this.assets.logo, footer: this.assets.footerLogo };
  }

  /** Scoped + prefixed stylesheet per heading font; computed once and reused for every render. */
  private cssForEmbed(heading: HeadingFont): string {
    let css = this.embedCss.get(heading);
    if (css === undefined) {
      const scoped = transformCss(this.assets.fontCss(heading) + this.assets.pageCss, {
        scope: SCOPE,
        classPrefix: CLASS_PREFIX,
        rootClass: ROOT_CLASS,
        dropSelector: (selector) => CHROME_SELECTOR.test(selector),
      });
      css = jsonSafeCss(EMBED_RESET + scoped + EMBED_OVERRIDES);
      this.embedCss.set(heading, css);
    }
    return css;
  }
}

function imageUrls(markup: string): string[] {
  const urls = new Set<string>();
  for (const m of markup.matchAll(/\s(?:src|srcset)="([^"]+)"/gi)) {
    for (const candidate of m[1]!.split(',')) {
      const url = candidate.trim().split(/\s+/)[0]!.replace(/&amp;/g, '&');
      if (url && !url.startsWith('data:')) urls.add(url);
    }
  }
  return [...urls];
}
