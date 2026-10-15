import type { ComponentType } from 'react';
import { defaultPropsFor, type Section, type SectionType } from '../../../contracts';
import { newId } from '../../../lib/ids';
import * as E from './editors';

export interface SectionDefinition<T extends SectionType = SectionType> {
  type: T;
  label: string;
  icon: string;
  description: string;
  Editor: ComponentType<E.EditorProps<T>>;
  /** One-line summary shown in the section list. */
  summarize: (props: Extract<Section, { type: T }>['props']) => string;
}

/**
 * Registry of section types available in the builder. Adding a section type
 * to the panel = adding one entry here (plus its editor component).
 */
export const SECTION_CATALOG: { [T in SectionType]: SectionDefinition<T> } = {
  hero: {
    type: 'hero',
    label: 'Hero banner',
    icon: '🖼️',
    description: 'Full-width banner carousel with optional text',
    Editor: E.HeroEditor,
    summarize: (p) => `${p.slides.length} slide(s)${p.slides[0]?.heading ? ` · ${p.slides[0].heading}` : ''}`,
  },
  intro: {
    type: 'intro',
    label: 'Intro',
    icon: '📝',
    description: 'Heading with a short paragraph',
    Editor: E.IntroEditor,
    summarize: (p) => p.heading,
  },
  features: {
    type: 'features',
    label: 'Highlights',
    icon: '✨',
    description: 'Why-buy USPs with icons',
    Editor: E.FeaturesEditor,
    summarize: (p) => `${p.items.length} highlight(s) · ${p.heading}`,
  },
  brandGrid: {
    type: 'brandGrid',
    label: 'Brand grid',
    icon: '🏷️',
    description: 'Gift cards grid / carousel with search & filters',
    Editor: E.BrandGridEditor,
    summarize: (p) => `${p.brands.length} brand(s) · ${p.heading}`,
  },
  brandTabs: {
    type: 'brandTabs',
    label: 'Brand tabs',
    icon: '🗂️',
    description: 'Tabbed collections, e.g. “Who are you gifting?”',
    Editor: E.BrandTabsEditor,
    summarize: (p) => `${p.tabs.length} tab(s) · ${p.heading}`,
  },
  categories: {
    type: 'categories',
    label: 'Categories',
    icon: '🧭',
    description: 'Image tiles linking to categories',
    Editor: E.CategoriesEditor,
    summarize: (p) => `${p.items.length} tile(s) · ${p.heading}`,
  },
  imageBanners: {
    type: 'imageBanners',
    label: 'Promo banners',
    icon: '🪧',
    description: '1–3 clickable promotional images per row',
    Editor: E.ImageBannersEditor,
    summarize: (p) => `${p.items.length} banner(s)`,
  },
  richText: {
    type: 'richText',
    label: 'Content',
    icon: '📄',
    description: 'Long-form rich text (SEO content)',
    Editor: E.RichTextSectionEditor,
    summarize: (p) => p.heading,
  },
  faq: {
    type: 'faq',
    label: 'FAQs',
    icon: '❓',
    description: 'Accordion of questions & answers',
    Editor: E.FaqEditor,
    summarize: (p) => `${p.items.length} question(s)`,
  },
  terms: {
    type: 'terms',
    label: 'Terms & Conditions',
    icon: '📜',
    description: 'Collapsible T&C block',
    Editor: E.TermsEditor,
    summarize: (p) => p.heading,
  },
  cta: {
    type: 'cta',
    label: 'Call to action',
    icon: '📣',
    description: 'Highlighted strip with a button',
    Editor: E.CtaEditor,
    summarize: (p) => p.heading,
  },
};

export function sectionDefinition<T extends SectionType>(type: T): SectionDefinition<T> {
  return SECTION_CATALOG[type] as SectionDefinition<T>;
}

/** The section's heading, if its type has one. */
export function sectionHeading(section: Section): string {
  const heading = (section.props as { heading?: unknown }).heading;
  return typeof heading === 'string' ? heading.trim() : '';
}

/** What the panel calls a section: its own name, else its heading, else its type. */
export function sectionTitle(section: Section): string {
  return section.name?.trim() || sectionHeading(section) || sectionDefinition(section.type).label;
}

export function createSection(type: SectionType): Section {
  const def = SECTION_CATALOG[type];
  const props = defaultPropsFor(type) as Record<string, unknown>;
  if ('heading' in props && !props.heading) props.heading = def.label;
  return { id: newId('s_'), type, visible: true, anchor: '', props } as Section;
}
