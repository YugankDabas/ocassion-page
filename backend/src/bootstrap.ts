import { Prisma, type PrismaClient } from '@prisma/client';
import { siteSettingsSchema } from './contracts';
import { OCCASIONS, THEME_PRESETS } from './domain/occasions/occasionCatalog';
import type { Logger } from './lib/logger';
import type { IPasswordHasher } from './services/security';

/**
 * The first administrator. Created ONLY when the User table is empty (a brand-new
 * environment), with a known default password that must be changed at the first
 * sign-in: until then the account can do nothing else. Every other user is
 * invited by an administrator from the Users screen; there is no sign-up.
 */
export const DEFAULT_ADMIN = {
  email: 'shivam.nagpal@gyftr.net',
  name: 'Shivam Nagpal',
  password: 'Gyftr@123',
} as const;

/**
 * Makes a new database usable, at every start-up. Idempotent and safe when several
 * containers start together:
 *  - creates any missing occasion (never overwrites one edited in the panel),
 *  - creates the default header / footer settings if there are none,
 *  - creates the first administrator if there are no users at all.
 */
export async function bootstrap(prisma: PrismaClient, pagePublicBaseUrl: string, hasher: IPasswordHasher, logger: Logger): Promise<void> {
  const publicBase = pagePublicBaseUrl.replace(/\/$/, '');
  const gyftr = new URL(publicBase).origin;

  const existing = new Set((await prisma.occasion.findMany({ select: { slug: true } })).map((o) => o.slug));
  const missing = OCCASIONS.map((o, index) => ({ o, index })).filter(({ o }) => !existing.has(o.slug));
  if (missing.length) {
    const { count } = await prisma.occasion.createMany({
      skipDuplicates: true,
      data: missing.map(({ o, index }) => ({
        slug: o.slug,
        name: o.name,
        shortName: o.shortName,
        recipients: o.recipients,
        emoji: o.emoji,
        pageUrl: `${publicBase}/${o.slug}`,
        sortOrder: index,
        theme: { ...THEME_PRESETS[o.preset], motif: o.motif } as unknown as Prisma.InputJsonValue,
      })),
    });
    logger.info({ created: count }, 'Occasions created');
  }

  await prisma.siteSetting.createMany({
    skipDuplicates: true,
    data: [{ key: 'site', value: defaultSiteSettings(gyftr) as unknown as Prisma.InputJsonValue }],
  });

  if ((await prisma.user.count()) === 0) {
    try {
      await prisma.user.create({
        data: {
          email: DEFAULT_ADMIN.email,
          name: DEFAULT_ADMIN.name,
          role: 'ADMIN',
          passwordHash: await hasher.hash(DEFAULT_ADMIN.password),
          mustChangePassword: true,
        },
      });
      logger.warn({ email: DEFAULT_ADMIN.email }, 'First administrator created with the default password; it must be changed at first sign-in');
    } catch (err) {
      // Another container created it at the same moment.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }
}

function defaultSiteSettings(gyftr: string) {
  return siteSettingsSchema.parse({
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
}
