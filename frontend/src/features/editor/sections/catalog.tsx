import type { ComponentType } from 'react';
import { defaultPropsFor, type Section, type SectionType } from '../../../contracts';
import { newId } from '../../../lib/ids';
import * as E from './editors';

export interface SectionDefinition<T extends SectionType = SectionType> {
  type: T;
  label: string;
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
    description: 'Full-width banner carousel with optional text',
    Editor: E.HeroEditor,
    summarize: (p) => `${p.slides.length} slide(s)${p.slides[0]?.heading ? ` · ${p.slides[0].heading}` : ''}`,
  },
  intro: {
    type: 'intro',
    label: 'Intro',
    description: 'Heading with a short paragraph',
    Editor: E.IntroEditor,
    summarize: (p) => p.heading,
  },
  features: {
    type: 'features',
    label: 'Highlights',
    description: 'Why-buy USPs with icons',
    Editor: E.FeaturesEditor,
    summarize: (p) => `${p.items.length} highlight(s) · ${p.heading}`,
  },
  brandGrid: {
    type: 'brandGrid',
    label: 'Brand grid',
    description: 'Gift cards grid / carousel with search & filters',
    Editor: E.BrandGridEditor,
    summarize: (p) => `${p.brands.length} brand(s) · ${p.heading}`,
  },
  brandTabs: {
    type: 'brandTabs',
    label: 'Brand tabs',
    description: 'Tabbed collections, e.g. “Who are you gifting?”',
    Editor: E.BrandTabsEditor,
    summarize: (p) => `${p.tabs.length} tab(s) · ${p.heading}`,
  },
  categories: {
    type: 'categories',
    label: 'Categories',
    description: 'Image tiles linking to categories',
    Editor: E.CategoriesEditor,
    summarize: (p) => `${p.items.length} tile(s) · ${p.heading}`,
  },
  imageBanners: {
    type: 'imageBanners',
    label: 'Promo banners',
    description: '1–3 clickable promotional images per row',
    Editor: E.ImageBannersEditor,
    summarize: (p) => `${p.items.length} banner(s)`,
  },
  richText: {
    type: 'richText',
    label: 'Content',
    description: 'Long-form rich text (SEO content)',
    Editor: E.RichTextSectionEditor,
    summarize: (p) => p.heading,
  },
  faq: {
    type: 'faq',
    label: 'FAQs',
    description: 'Accordion of questions & answers',
    Editor: E.FaqEditor,
    summarize: (p) => `${p.items.length} question(s)`,
  },
  terms: {
    type: 'terms',
    label: 'Terms & Conditions',
    description: 'Collapsible T&C block',
    Editor: E.TermsEditor,
    summarize: (p) => p.heading,
  },
  cta: {
    type: 'cta',
    label: 'Call to action',
    description: 'Highlighted strip with a button',
    Editor: E.CtaEditor,
    summarize: (p) => p.heading,
  },
  buttons: {
    type: 'buttons',
    label: 'Buttons',
    description: 'A row of buttons, placed anywhere on the page',
    Editor: E.ButtonsSectionEditor,
    summarize: (p) => p.buttons.map((b) => b.label).filter(Boolean).join(' · ') || 'No buttons yet',
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
  // A new row of buttons starts with one, ready to edit.
  if (type === 'buttons') props.buttons = [{ id: newId('b_'), label: 'Explore gift cards', href: '#brands', style: 'theme', size: 'medium', icon: { name: 'arrowRight', image: { url: '', alt: '' } }, newTab: false }];
  return { id: newId('s_'), type, visible: true, anchor: '', props } as Section;
}
