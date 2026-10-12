import type { Section, SectionType } from '../../contracts';
import type { IHtmlSanitizer } from '../../lib/HtmlSanitizer';

type SectionOfType<T extends SectionType> = Extract<Section, { type: T }>;

/**
 * Behaviour attached to one section type. Structural validation is done by the
 * shared zod contract; handlers add the server-side concerns that a schema
 * cannot express (HTML sanitisation, brand reference discovery, ...).
 */
export interface SectionHandler<T extends SectionType = SectionType> {
  readonly type: T;
  /** Return a copy of the section that is safe to persist and serve. */
  sanitize(section: SectionOfType<T>): SectionOfType<T>;
  /** Brand ids the section references (used to resolve brand data on read). */
  referencedBrandIds(section: SectionOfType<T>): string[];
}

/** Sensible no-op defaults; concrete handlers override only what they need. */
export abstract class BaseSectionHandler<T extends SectionType> implements SectionHandler<T> {
  abstract readonly type: T;

  constructor(protected readonly html: IHtmlSanitizer) {}

  sanitize(section: SectionOfType<T>): SectionOfType<T> {
    return section;
  }

  referencedBrandIds(_section: SectionOfType<T>): string[] {
    return [];
  }
}
