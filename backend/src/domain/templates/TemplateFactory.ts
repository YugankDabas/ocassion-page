import {
  CONTENT_SCHEMA_VERSION,
  faqPropsSchema,
  heroPropsSchema,
  pageContentSchema,
  themeSchema,
  type PageContent,
  type Section,
} from '../../contracts';
import { itemId } from '../../lib/ids';

export interface OccasionForTemplate {
  name: string;
  shortName: string;
  recipients: string;
  emoji: string;
  theme: unknown;
}

export interface ITemplateFactory {
  /** Build the default, ready-to-edit page for an occasion. */
  createDefault(occasion: OccasionForTemplate, featuredBrandIds: string[]): PageContent;
  createBlank(occasion: OccasionForTemplate): PageContent;
}

/**
 * Generates the default occasion template: the Woohoo-style layout of
 * banner → intro → USPs → brands → collections → SEO copy → FAQs → T&Cs,
 * pre-filled with occasion-aware copy so a new page is publishable after
 * only adding a banner image and picking brands.
 */
export class TemplateFactory implements ITemplateFactory {
  createBlank(occasion: OccasionForTemplate): PageContent {
    return pageContentSchema.parse({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      theme: this.theme(occasion),
      seo: { metaTitle: `${occasion.name} | GyFTR`.slice(0, 70) },
      sections: [],
    });
  }

  createDefault(occasion: OccasionForTemplate, featuredBrandIds: string[]): PageContent {
    const o = occasion;
    const sections: Section[] = [
      {
        id: itemId('s_'),
        type: 'hero',
        visible: true,
        anchor: '',
        props: heroPropsSchema.parse({
          autoplayMs: 5000,
          height: 'standard',
          showTrustBar: true,
          slides: [
            {
              id: itemId('sl_'),
              desktopImage: { url: '', alt: '' },
              mobileImage: { url: '', alt: '' },
              href: '#brands',
              eyebrow: `Celebrate ${o.shortName} with the perfect gift`,
              heading: 'Digital Gift Cards',
              subheading: 'Up to 30% savings on 300+ top brand gift cards. Instant delivery on WhatsApp & email.',
              ctaLabel: 'Explore gift cards',
              artwork: 'auto',
              artImage: { url: '', alt: '' },
              sideImage: { url: '', alt: '' },
              showCard: true,
              showDecorations: true,
              cardTitle: 'Gift Card',
              cardText: o.shortName.length <= 20 && /^[A-Z]/.test(o.shortName) ? `Happy ${o.shortName}` : 'Just for you',
            },
          ],
        }),
      },
      {
        id: itemId('s_'),
        type: 'intro',
        visible: true,
        anchor: '',
        props: {
          eyebrow: '',
          heading: `Celebrate ${o.shortName} with the Perfect Gift`,
          body:
            `<p>This ${o.shortName}, show ${o.recipients} how much they mean to you with a gift they will actually love. ` +
            'Digital gift cards from GyFTR let them pick exactly what they want — from fashion and gadgets to dining, travel and more — ' +
            'while you save on every purchase.</p>',
          align: 'center',
          tone: 'primary',
        },
      },
      {
        id: itemId('s_'),
        type: 'features',
        visible: true,
        anchor: '',
        props: {
          heading: `Why gift cards are the best ${o.shortName} gift`,
          subheading: '',
          columns: 4,
          tone: 'transparent',
          items: [
            { id: itemId('f_'), icon: { url: '', alt: '' }, emoji: '🎯', title: 'Freedom of choice', description: 'Let them choose what they love from 300+ top brands across 20+ categories.' },
            { id: itemId('f_'), icon: { url: '', alt: '' }, emoji: '⚡', title: 'Instant delivery', description: 'Gift cards are delivered within minutes over WhatsApp and email.' },
            { id: itemId('f_'), icon: { url: '', alt: '' }, emoji: '💰', title: 'Save while you gift', description: 'Enjoy upfront discounts and loyalty points on every gift card.' },
            { id: itemId('f_'), icon: { url: '', alt: '' }, emoji: '🛍️', title: 'Easy redemption', description: 'Redeem online or in-store at thousands of brand outlets across India.' },
          ],
        },
      },
      {
        id: itemId('s_'),
        type: 'brandGrid',
        visible: true,
        anchor: 'brands',
        props: {
          heading: `Best gift cards for ${o.shortName}`,
          subheading: 'Handpicked brands with the biggest savings this season.',
          layout: 'grid',
          brands: featuredBrandIds.map((brandId) => ({ brandId, badge: '', href: '' })),
          initialCount: 12,
          showSearch: true,
          showDiscountFilter: true,
          ctaLabel: 'Buy now',
        },
      },
      {
        id: itemId('s_'),
        type: 'brandTabs',
        visible: true,
        anchor: 'collections',
        props: {
          heading: `Who are you gifting this ${o.shortName}?`,
          subheading: 'Pick a recipient to see gift cards they will love.',
          ctaLabel: 'Buy now',
          tabs: [
            { id: itemId('t_'), label: 'Family', emoji: '👨‍👩‍👧', brands: [] },
            { id: itemId('t_'), label: 'Friends', emoji: '🥳', brands: [] },
            { id: itemId('t_'), label: 'Colleagues', emoji: '💼', brands: [] },
          ],
        },
      },
      {
        id: itemId('s_'),
        type: 'richText',
        visible: true,
        anchor: '',
        props: {
          heading: `${o.shortName} gifting made simple`,
          collapsible: true,
          tone: 'surface',
          body:
            `<p>Finding the right gift for ${o.recipients} can be tricky. Preferences differ, sizes vary and delivery deadlines loom. ` +
            'A digital gift card solves all of that: the recipient chooses what they love, and you never have to worry about returns.</p>' +
            '<h3>Why buy gift cards on GyFTR?</h3>' +
            '<ul><li><strong>Upfront savings</strong> on 300+ brands.</li><li><strong>Loyalty points</strong> on every purchase (1 point = ₹1).</li>' +
            '<li><strong>Instant delivery</strong> over WhatsApp and email.</li><li><strong>Secure payments</strong> via UPI, cards and more.</li></ul>',
        },
      },
      {
        id: itemId('s_'),
        type: 'faq',
        visible: true,
        anchor: 'faqs',
        props: faqPropsSchema.parse({
          heading: 'Frequently asked questions',
          emitStructuredData: true,
          items: [
            { id: itemId('q_'), question: `How do I send a ${o.shortName} gift card?`, answer: '<p>Select a brand, choose the amount, tick “I am Gyfting” and enter the recipient’s details. The gift card is delivered instantly via WhatsApp and email.</p>' },
            { id: itemId('q_'), question: 'How quickly are gift cards delivered?', answer: '<p>Most gift cards are delivered within a few minutes of a successful payment.</p>' },
            { id: itemId('q_'), question: 'Can I use a discount on gift cards?', answer: '<p>Yes. GyFTR offers upfront discounts on most brands, and you also earn loyalty points that can be used on future purchases.</p>' },
            { id: itemId('q_'), question: 'How can the recipient redeem the gift card?', answer: '<p>Each brand page lists step-by-step redemption instructions. Most cards can be redeemed online, in-store, or both.</p>' },
            { id: itemId('q_'), question: 'What is the validity of a gift card?', answer: '<p>Validity varies by brand and is shown on the brand page and in the delivery message.</p>' },
            { id: itemId('q_'), question: 'How do I check my voucher status?', answer: '<p>Use “Check Voucher Status” on gyftr.com with your order details.</p>' },
          ],
        }),
      },
      {
        id: itemId('s_'),
        type: 'terms',
        visible: true,
        anchor: 'terms',
        props: {
          heading: 'Terms & Conditions',
          collapsible: true,
          defaultOpen: false,
          body:
            '<ol><li>Discounts and offers are valid for a limited period and may change without prior notice.</li>' +
            '<li>Gift cards are subject to the terms and conditions of the respective brands.</li>' +
            '<li>Gift cards once purchased cannot be cancelled, refunded or exchanged for cash.</li>' +
            '<li>Loyalty points are credited as per the GyFTR loyalty programme terms.</li>' +
            '<li>GyFTR reserves the right to modify or withdraw this offer at any time.</li></ol>',
        },
      },
    ];

    return pageContentSchema.parse({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      theme: this.theme(o),
      seo: {
        metaTitle: `${o.name} – Up to 30% Off | GyFTR`.slice(0, 70),
        metaDescription:
          `Buy ${o.name.toLowerCase()} from 300+ top brands with up to 30% savings and instant delivery on WhatsApp & email.`.slice(0, 170),
      },
      breadcrumb: { show: true, label: o.name },
      sections,
    });
  }

  private theme(occasion: OccasionForTemplate) {
    const parsed = themeSchema.safeParse(occasion.theme);
    return parsed.success ? parsed.data : themeSchema.parse({});
  }
}
