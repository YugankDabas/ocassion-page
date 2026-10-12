import type { PageRenderData } from '../contracts';
import { htmlToText } from './html';

/** Head metadata for a page. The host site (or the standalone document) writes these into <head>. */
export interface PageSeo {
  title: string;
  description: string;
  keywords: string;
  canonicalUrl: string;
  noIndex: boolean;
  /** Absolute URL of the social-share image, or '' when the page has none. */
  ogImage: string;
  /** schema.org structured data objects (FAQ, brand list). Embed each as <script type="application/ld+json">. */
  jsonLd: object[];
}

const absolute = (url: string, siteOrigin: string) => (url.startsWith('/') ? `${siteOrigin}${url}` : url);

export function buildSeo(data: PageRenderData, pageUrl: string): PageSeo {
  const siteOrigin = new URL(pageUrl).origin;
  const { seo, sections } = data.content;
  const intro = sections.find((s) => s.type === 'intro');
  const hero = sections.find((s) => s.type === 'hero');
  const ogImage = seo.ogImage.url || (hero?.type === 'hero' ? hero.props.slides[0]?.desktopImage.url : '') || '';
  return {
    title: seo.metaTitle || `${data.page.title} | GyFTR`,
    description: seo.metaDescription || (intro?.type === 'intro' ? htmlToText(intro.props.body).slice(0, 160) : `Buy ${data.page.title} on GyFTR.`),
    keywords: seo.keywords,
    canonicalUrl: seo.canonicalUrl ? absolute(seo.canonicalUrl, siteOrigin) : pageUrl,
    noIndex: seo.noIndex,
    ogImage: ogImage ? absolute(ogImage, siteOrigin) : '',
    jsonLd: buildJsonLd(data, siteOrigin),
  };
}

/** schema.org structured data: FAQ (when enabled) and the brand list. */
function buildJsonLd(data: PageRenderData, siteOrigin: string): object[] {
  const graph: object[] = [];
  const visible = data.content.sections.filter((s) => s.visible);

  const faqs = visible.flatMap((s) => (s.type === 'faq' && s.props.emitStructuredData ? s.props.items.filter((q) => q.question && q.answer) : []));
  if (faqs.length) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: htmlToText(q.answer) } })),
    });
  }

  const brandIds = visible.flatMap((s) => (s.type === 'brandGrid' ? s.props.brands.map((b) => b.brandId) : []));
  const brands = [...new Set(brandIds)].map((id) => data.brands[id]).filter((b) => b !== undefined);
  if (brands.length) {
    graph.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: data.page.title,
      itemListElement: brands.slice(0, 50).map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: `${b.name} Gift Card`, url: absolute(b.productUrl, siteOrigin) })),
    });
  }
  return graph;
}

/** JSON for a <script type="application/ld+json">, escaped so content can never close the tag. */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
