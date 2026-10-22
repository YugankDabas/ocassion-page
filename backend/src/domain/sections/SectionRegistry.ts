import type { PageContent, Section, SectionType } from '../../contracts';
import type { IHtmlSanitizer } from '../../lib/HtmlSanitizer';
import type { SectionHandler } from './SectionHandler';
import * as H from './handlers';

/**
 * Looks up the handler for a section type. New section types are added by
 * registering a handler — callers never switch on `section.type` themselves.
 */
export class SectionRegistry {
  private readonly handlers = new Map<SectionType, SectionHandler>();

  register(handler: SectionHandler<any>): this {
    if (this.handlers.has(handler.type)) throw new Error(`Section handler "${handler.type}" registered twice`);
    this.handlers.set(handler.type, handler as SectionHandler);
    return this;
  }

  get(type: SectionType): SectionHandler {
    const handler = this.handlers.get(type);
    if (!handler) throw new Error(`No handler registered for section type "${type}"`);
    return handler;
  }

  /** Sanitise every section of a (already schema-validated) content document. */
  sanitizeContent(content: PageContent): PageContent {
    return {
      ...content,
      sections: content.sections.map((s) => this.get(s.type).sanitize(s as never) as Section),
    };
  }

  referencedBrandIds(content: PageContent): string[] {
    const ids = new Set<string>();
    for (const section of content.sections) {
      for (const id of this.get(section.type).referencedBrandIds(section as never)) ids.add(id);
    }
    return [...ids];
  }

  static createDefault(html: IHtmlSanitizer): SectionRegistry {
    return new SectionRegistry()
      .register(new H.HeroSectionHandler(html))
      .register(new H.IntroSectionHandler(html))
      .register(new H.FeaturesSectionHandler(html))
      .register(new H.BrandGridSectionHandler(html))
      .register(new H.BrandTabsSectionHandler(html))
      .register(new H.CategoriesSectionHandler(html))
      .register(new H.ImageBannersSectionHandler(html))
      .register(new H.RichTextSectionHandler(html))
      .register(new H.FaqSectionHandler(html))
      .register(new H.TermsSectionHandler(html))
      .register(new H.CtaSectionHandler(html))
      .register(new H.ButtonsSectionHandler(html));
  }
}
