/**
 * Idempotent seed. Safe to run on every deploy:
 *  - creates any missing occasions (never overwrites ones edited in the panel),
 *  - creates default header/footer settings if none exist.
 * Admin users are created with `npm run admin:create`, never with default passwords.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { siteSettingsSchema } from '../src/contracts';
import { OCCASIONS, THEME_PRESETS } from '../src/domain/occasions/occasionCatalog';

const prisma = new PrismaClient();
const publicBase = (process.env.PAGE_PUBLIC_BASE_URL ?? 'https://www.gyftr.com/occasion').replace(/\/$/, '');
const gyftr = new URL(publicBase).origin;

const DEFAULT_SITE = siteSettingsSchema.parse({
  header: {
    searchUrl: `${gyftr}/search?q=`,
    loginUrl: { label: 'Log In / Sign Up', href: `${gyftr}/login` },
    cartUrl: `${gyftr}/cart`,
    links: [
      { label: 'BuzzingNow', href: `${gyftr}/category/buzzing-now` },
      { label: 'Dining', href: `${gyftr}/category/dining` },
      { label: 'E-Commerce', href: `${gyftr}/category/e-commerce` },
      { label: 'Electronics', href: `${gyftr}/category/electronics` },
      { label: 'Entertainment', href: `${gyftr}/category/entertainment` },
      { label: 'Fashion', href: `${gyftr}/category/fashion` },
      { label: 'Gaming', href: `${gyftr}/category/gaming` },
      { label: 'Gifting', href: `${gyftr}/category/gifting` },
      { label: 'Home Needs', href: `${gyftr}/category/home-needs` },
      { label: 'Travel', href: `${gyftr}/category/travel` },
      { label: 'Wellness', href: `${gyftr}/category/wellness` },
    ],
  },
  footer: {
    columns: [
      {
        title: 'GyFTR',
        links: [
          { label: 'About Us', href: `${gyftr}/about-us` },
          { label: 'Contact Us', href: `${gyftr}/contact-us` },
          { label: 'Check Voucher Status', href: `${gyftr}/check-voucher-status` },
        ],
      },
      {
        title: 'Policies',
        links: [
          { label: 'Terms & Conditions', href: `${gyftr}/terms-and-conditions` },
          { label: 'Privacy Policy', href: `${gyftr}/privacy-policy` },
        ],
      },
    ],
    copyright: `© ${new Date().getFullYear()} GyFTR. All rights reserved.`,
  },
});

async function main() {
  let created = 0;
  for (const [index, o] of OCCASIONS.entries()) {
    if (await prisma.occasion.findUnique({ where: { slug: o.slug }, select: { id: true } })) continue;
    await prisma.occasion.create({
      data: {
        slug: o.slug,
        name: o.name,
        shortName: o.shortName,
        recipients: o.recipients,
        emoji: o.emoji,
        pageUrl: `${publicBase}/${o.slug}`,
        sortOrder: index,
        theme: { ...THEME_PRESETS[o.preset], motif: o.motif } as unknown as Prisma.InputJsonValue,
      },
    });
    created++;
  }
  console.log(`Occasions: ${created} created, ${OCCASIONS.length - created} already present`);

  const site = await prisma.siteSetting.findUnique({ where: { key: 'site' } });
  if (!site) {
    await prisma.siteSetting.create({ data: { key: 'site', value: DEFAULT_SITE as unknown as Prisma.InputJsonValue } });
    console.log('Site settings: defaults created');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
