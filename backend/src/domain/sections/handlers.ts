import type { SectionOf } from '../../contracts';
import { BaseSectionHandler } from './SectionHandler';

export class HeroSectionHandler extends BaseSectionHandler<'hero'> {
  readonly type = 'hero' as const;
}

export class IntroSectionHandler extends BaseSectionHandler<'intro'> {
  readonly type = 'intro' as const;

  override sanitize(section: SectionOf<'intro'>): SectionOf<'intro'> {
    return { ...section, props: { ...section.props, body: this.html.sanitize(section.props.body) } };
  }
}

export class FeaturesSectionHandler extends BaseSectionHandler<'features'> {
  readonly type = 'features' as const;
}

export class BrandGridSectionHandler extends BaseSectionHandler<'brandGrid'> {
  readonly type = 'brandGrid' as const;

  override referencedBrandIds(section: SectionOf<'brandGrid'>): string[] {
    return section.props.brands.map((b) => b.brandId);
  }
}

export class BrandTabsSectionHandler extends BaseSectionHandler<'brandTabs'> {
  readonly type = 'brandTabs' as const;

  override referencedBrandIds(section: SectionOf<'brandTabs'>): string[] {
    return section.props.tabs.flatMap((t) => t.brands.map((b) => b.brandId));
  }
}

export class CategoriesSectionHandler extends BaseSectionHandler<'categories'> {
  readonly type = 'categories' as const;
}

export class ImageBannersSectionHandler extends BaseSectionHandler<'imageBanners'> {
  readonly type = 'imageBanners' as const;
}

export class RichTextSectionHandler extends BaseSectionHandler<'richText'> {
  readonly type = 'richText' as const;

  override sanitize(section: SectionOf<'richText'>): SectionOf<'richText'> {
    return { ...section, props: { ...section.props, body: this.html.sanitize(section.props.body) } };
  }
}

export class FaqSectionHandler extends BaseSectionHandler<'faq'> {
  readonly type = 'faq' as const;

  override sanitize(section: SectionOf<'faq'>): SectionOf<'faq'> {
    return {
      ...section,
      props: {
        ...section.props,
        items: section.props.items.map((item) => ({ ...item, answer: this.html.sanitize(item.answer) })),
      },
    };
  }
}

export class TermsSectionHandler extends BaseSectionHandler<'terms'> {
  readonly type = 'terms' as const;

  override sanitize(section: SectionOf<'terms'>): SectionOf<'terms'> {
    return { ...section, props: { ...section.props, body: this.html.sanitize(section.props.body) } };
  }
}

export class CtaSectionHandler extends BaseSectionHandler<'cta'> {
  readonly type = 'cta' as const;
}

export class ButtonsSectionHandler extends BaseSectionHandler<'buttons'> {
  readonly type = 'buttons' as const;
}
