import { isBucketName, type Env } from './config/env';
import { createPrismaClient } from './db';
import { PageUrlPolicy } from './domain/pages/PageUrlPolicy';
import { SectionRegistry } from './domain/sections/SectionRegistry';
import { TemplateFactory } from './domain/templates/TemplateFactory';
import {
  AuthController,
  BrandController,
  CatalogController,
  MediaController,
  PageController,
  UserController,
} from './http/controllers';
import { HtmlSanitizer } from './lib/HtmlSanitizer';
import type { Logger } from './lib/logger';
import { ImageInliner } from './render/ImageInliner';
import { PageRenderer } from './render/PageRenderer';
import { PrismaBrandRepository } from './repositories/prisma/PrismaBrandRepository';
import { PrismaPageRepository } from './repositories/prisma/PrismaPageRepository';
import { PrismaPublicationRepository } from './repositories/prisma/PrismaPublicationRepository';
import {
  PrismaAuditRepository,
  PrismaMediaRepository,
  PrismaOccasionRepository,
  PrismaSettingsRepository,
  PrismaTemplateRepository,
  PrismaUserRepository,
} from './repositories/prisma/PrismaRepositories';
import { AuditService } from './services/AuditService';
import { AuthService } from './services/AuthService';
import { BrandSyncService } from './services/BrandSyncService';
import { BrandService } from './services/BrandService';
import { ContentChangeHub } from './services/ContentChanges';
import { PagePayloadService } from './services/PagePayloadService';
import { OccasionService, SiteSettingsService, TemplateService } from './services/CatalogServices';
import { MediaService, SharpImageProcessor } from './services/MediaService';
import { PageService } from './services/PageService';
import { PublicationService } from './services/PublicationService';
import { BcryptPasswordHasher, SessionTokenService } from './services/security';
import { UserService } from './services/UserService';
import { LocalDiskStorage, S3Storage, UnavailableStorage, type IStorageProvider } from './storage/StorageProvider';

/**
 * Composition root: the only place that knows concrete implementations.
 * Everything else receives its collaborators through constructors.
 */
export function createContainer(env: Env, logger: Logger, prisma = createPrismaClient(env.DATABASE_URL)) {
  const repos = {
    users: new PrismaUserRepository(prisma),
    occasions: new PrismaOccasionRepository(prisma),
    templates: new PrismaTemplateRepository(prisma),
    pages: new PrismaPageRepository(prisma),
    publications: new PrismaPublicationRepository(prisma),
    brands: new PrismaBrandRepository(prisma),
    media: new PrismaMediaRepository(prisma),
    settings: new PrismaSettingsRepository(prisma),
    audit: new PrismaAuditRepository(prisma),
  };

  // Uploaded images: the S3 bucket when one is configured, local disk otherwise (development).
  // A deployed container's disk is lost on every deploy, so without a usable bucket uploads are refused, not kept on disk.
  const storage: IStorageProvider = isBucketName(env.S3_BUCKET)
    ? new S3Storage({ bucket: env.S3_BUCKET, region: env.AWS_REGION, prefix: env.S3_PREFIX, publicBaseUrl: env.MEDIA_BASE_URL })
    : env.isProduction || env.S3_BUCKET || !env.PUBLIC_UPLOADS_BASE_URL
      ? new UnavailableStorage()
      : new LocalDiskStorage(env.LOCAL_UPLOAD_DIR, env.PUBLIC_UPLOADS_BASE_URL);

  const html = new HtmlSanitizer();
  const registry = SectionRegistry.createDefault(html);
  const urls = new PageUrlPolicy(env.PAGE_PUBLIC_BASE_URL);
  const changes = new ContentChangeHub(logger);
  const hasher = new BcryptPasswordHasher();
  const sessionTokens = new SessionTokenService(env.JWT_SECRET, env.SESSION_TTL_HOURS);
  const audit = new AuditService(repos.audit, logger);
  const site = new SiteSettingsService(repos.settings, changes, audit);

  const pages = new PageService(repos.pages, repos.occasions, repos.templates, repos.brands, registry, new TemplateFactory(), audit, urls);
  const payloads = new PagePayloadService(repos.occasions, repos.brands, site, registry);
  // Downloads embed images from our own media storage and GyFTR's CDN (brand logos); nothing else is fetched.
  const inliner = new ImageInliner([storage.publicBaseUrl, 'https://cdn.gyftr.com', 'https://cdn2.gyftr.com'].filter(Boolean), logger);
  const publications = new PublicationService(pages, repos.pages, repos.publications, payloads, new PageRenderer(), inliner, urls, logger, {
    requireHttpsImages: env.isProduction,
  });

  // A brand or site-settings change re-renders the published pages.
  changes.subscribe(() => publications.refreshAll());

  const services = {
    audit,
    site,
    auth: new AuthService(repos.users, hasher, sessionTokens, audit),
    users: new UserService(repos.users, hasher, audit),
    occasions: new OccasionService(repos.occasions, urls, audit),
    templates: new TemplateService(repos.templates, repos.pages, audit),
    brands: new BrandService(repos.brands, changes, audit, new URL(env.PAGE_PUBLIC_BASE_URL).origin),
    brandSync: new BrandSyncService(repos.brands, changes, audit, logger, new URL(env.PAGE_PUBLIC_BASE_URL).origin),
    media: new MediaService(repos.media, storage, new SharpImageProcessor(), audit, logger),
    pages,
    publications,
  };

  const controllers = {
    // Every sign-in to the panel refreshes the brand library from GyFTR, in the background.
    auth: new AuthController(services.auth, { secure: env.isProduction }, (actor) => void services.brandSync.start(actor)),
    pages: new PageController(services.pages, services.templates, urls.baseUrl, services.publications, env.ADMIN_FRONTEND_ORIGIN),
    brands: new BrandController(services.brands, services.brandSync),
    media: new MediaController(services.media),
    catalog: new CatalogController(services.occasions, services.templates, services.site, services.audit),
    users: new UserController(services.users),
  };

  return { env, logger, prisma, storage, services, controllers };
}

export type Container = ReturnType<typeof createContainer>;
