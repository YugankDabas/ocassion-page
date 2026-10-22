import type { Section, SectionType } from '../../../contracts';
import { resolveBrands } from '../brand/types';
import * as S from './sections';

/**
 * Section type → renderer. Unknown types are already dropped while parsing the
 * payload, so adding a section type to the admin before the renderer is
 * deployed degrades gracefully instead of breaking the page.
 */
const REGISTRY: { [T in SectionType]: S.SectionComponent<T> } = {
  hero: S.HeroSection,
  intro: S.IntroSection,
  features: S.FeaturesSection,
  brandGrid: S.BrandGridSection,
  brandTabs: S.BrandTabsSection,
  categories: S.CategoriesSection,
  imageBanners: S.ImageBannersSection,
  richText: S.RichTextSection,
  faq: S.FaqSection,
  terms: S.TermsSection,
  cta: S.CtaSection,
  buttons: S.ButtonsSection,
};

export function SectionRenderer({ sections, ctx }: { sections: Section[]; ctx: Omit<S.RenderContext, 'index' | 'featured'> }) {
  const visible = sections.filter((s) => s.visible);
  const firstGrid = visible.find((s) => s.type === 'brandGrid');
  const featured = firstGrid?.type === 'brandGrid' ? resolveBrands(firstGrid.props.brands.slice(0, 6), ctx.brands) : [];
  return (
    <>
      {visible.map((section, index) => {
        const Component = REGISTRY[section.type] as S.SectionComponent<typeof section.type> | undefined;
        return Component ? <Component key={section.id} section={section as never} ctx={{ ...ctx, featured, index }} /> : null;
      })}
    </>
  );
}
