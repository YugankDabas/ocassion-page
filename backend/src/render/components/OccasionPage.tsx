import type { PageRenderData } from '../../contracts';
import { themeStyle } from '../theme';
import { resolveMotif } from './art/motifs';
import { Breadcrumb, SiteFooter, SiteHeader, type ChromeLogos } from './chrome';
import { SectionRenderer } from './sections/registry';

export interface OccasionPageProps {
  data: PageRenderData;
  /**
   * `fragment`: body-only markup for embedding in the live gyftr.com page — no
   * header / footer and no <main> landmark of its own (the host page has them).
   * `document`: a complete standalone page (preview and download).
   */
  mode: 'document' | 'fragment';
  /** Document mode only: include the GyFTR header, breadcrumb and footer. */
  chrome: boolean;
  logos: ChromeLogos;
}

/** The whole page: themed wrapper + (optional) GyFTR chrome + ordered sections. */
export function OccasionPage({ data, mode, chrome, logos }: OccasionPageProps) {
  const { content, site } = data;
  const fragment = mode === 'fragment';
  const showChrome = !fragment && chrome;
  const Main = fragment ? 'div' : 'main';

  return (
    <div className="occasion" style={themeStyle(content.theme)} data-pattern={content.theme.pattern} data-occasion-page={data.page.slug}>
      {showChrome && <SiteHeader site={site} logos={logos} />}
      {showChrome && content.breadcrumb.show && (
        <Breadcrumb homeUrl={site.header.homeUrl} label={content.breadcrumb.label || data.page.title} labels={site.labels} />
      )}
      <Main id={fragment ? undefined : 'main'} className="occasion-main">
        <SectionRenderer sections={content.sections} ctx={{ brands: data.brands, motif: resolveMotif(content.theme), labels: site.labels }} />
      </Main>
      {showChrome && <SiteFooter site={site} logos={logos} />}
    </div>
  );
}
