import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  PAGE_STATUSES,
  brandInputSchema,
  changePasswordInputSchema,
  createPageInputSchema,
  createUserInputSchema,
  duplicatePageInputSchema,
  loginInputSchema,
  occasionInputSchema,
  updateOccasionInputSchema,
  publishPageInputSchema,
  saveAsTemplateInputSchema,
  siteSettingsSchema,
  slugSchema,
  updatePageDraftInputSchema,
  updateUserInputSchema,
} from '../contracts';
import { randomToken } from '../lib/crypto';
import { BadRequestError, NotFoundError } from '../lib/errors';
import type { AuditService } from '../services/AuditService';
import type { AuthService } from '../services/AuthService';
import type { BrandService } from '../services/BrandService';
import type { OccasionService, SiteSettingsService, TemplateService } from '../services/CatalogServices';
import type { MediaService } from '../services/MediaService';
import type { PageService } from '../services/PageService';
import type { PublicationService } from '../services/PublicationService';
import type { UserService } from '../services/UserService';
import { CSRF_COOKIE, SESSION_COOKIE, actorOf, parse } from './middleware';

const idParam = z.object({ id: z.string().uuid() });
const paging = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().trim().max(100).optional(),
});

export interface CookieOptions {
  secure: boolean;
}

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: CookieOptions,
  ) {}

  login = async (req: Request, res: Response) => {
    const { email, password } = parse(loginInputSchema, req.body);
    const { user, token } = await this.auth.login(email, password, req.ip ?? null);
    const csrfToken = randomToken();
    const maxAge = this.auth.sessionTtlSeconds * 1000;
    const base = { secure: this.cookies.secure, sameSite: 'strict' as const, path: '/', maxAge };
    res.cookie(SESSION_COOKIE, token, { ...base, httpOnly: true });
    res.cookie(CSRF_COOKIE, csrfToken, { ...base, httpOnly: true });
    res.json({ user, csrfToken });
  };

  /** Returns the session user plus the CSRF token for the SPA to echo back. */
  me = async (req: Request, res: Response) => {
    res.json({ user: req.user, csrfToken: req.cookies?.[CSRF_COOKIE] ?? null });
  };

  logout = async (_req: Request, res: Response) => {
    const opts = { path: '/' };
    res.clearCookie(SESSION_COOKIE, opts);
    res.clearCookie(CSRF_COOKIE, opts);
    res.status(204).end();
  };

  logoutEverywhere = async (req: Request, res: Response) => {
    await this.auth.revokeSessions(actorOf(req).id);
    await this.logout(req, res);
  };

  changePassword = async (req: Request, res: Response) => {
    const input = parse(changePasswordInputSchema, req.body);
    await this.auth.changePassword(actorOf(req).id, input.currentPassword, input.newPassword, req.ip ?? null);
    await this.logout(req, res);
  };
}

export class PageController {
  constructor(
    private readonly pages: PageService,
    private readonly templates: TemplateService,
    private readonly pagePublicBaseUrl: string,
    private readonly publications: PublicationService,
    /** Origin of the admin panel: the only other site allowed to show the preview in a frame. */
    private readonly panelOrigin: string,
  ) {}

  list = async (req: Request, res: Response) => {
    const q = parse(
      z.object({
        status: z.enum(PAGE_STATUSES).optional(),
        occasionId: z.string().uuid().optional(),
        search: z.string().trim().max(100).optional(),
      }),
      req.query,
    );
    res.json({ items: await this.pages.list(q) });
  };

  /** Lets the panel show/validate URLs before saving. */
  config = async (_req: Request, res: Response) => {
    res.json({ publicBaseUrl: this.pagePublicBaseUrl });
  };

  get = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    res.json({ page: await this.pages.get(id) });
  };

  create = async (req: Request, res: Response) => {
    const page = await this.pages.create(actorOf(req), parse(createPageInputSchema, req.body));
    res.status(201).json({ page });
  };

  saveDraft = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    const page = await this.pages.saveDraft(actorOf(req), id, parse(updatePageDraftInputSchema, req.body));
    res.json({ page });
  };

  publish = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    const { expectedVersion, note } = parse(publishPageInputSchema, req.body);
    res.json({ page: await this.publications.publish(actorOf(req), id, expectedVersion, note) });
  };

  unpublish = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    res.json({ page: await this.publications.unpublish(actorOf(req), id) });
  };

  archive = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    res.json({ page: await this.publications.archive(actorOf(req), id) });
  };

  unarchive = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    res.json({ page: await this.pages.restoreFromArchive(actorOf(req), id) });
  };

  remove = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    await this.pages.delete(actorOf(req), id);
    res.status(204).end();
  };

  duplicate = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    const body = parse(duplicatePageInputSchema, req.body);
    const page = await this.pages.duplicate(actorOf(req), id, body.pageUrl, body.title);
    res.status(201).json({ page });
  };

  revisions = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    const items = await this.pages.revisions(id);
    // The list view does not need full content documents.
    res.json({ items: items.map(({ content: _content, ...rest }) => rest) });
  };

  restoreRevision = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ revisionId: z.string().uuid(), expectedVersion: z.number().int().positive() }), req.body);
    const page = await this.pages.restoreRevision(actorOf(req), id, body.revisionId, body.expectedVersion);
    res.json({ page });
  };

  /**
   * Render a standalone preview page. With a `content` field (the editor's
   * unsaved document, as JSON text) it previews that; without it, the saved
   * draft. Nothing is stored.
   *
   * It is requested by a form post that targets an iframe, and answers with a
   * real HTML document carrying its own policy: sandboxed (no access to the
   * panel, its cookies or the API) and allowed to run only its inline script.
   */
  preview = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    const { content } = parse(z.object({ content: z.string().max(2_000_000).optional() }), req.body ?? {});
    let unsaved: unknown;
    if (content !== undefined) {
      try {
        unsaved = JSON.parse(content);
      } catch {
        throw new BadRequestError('content must be JSON');
      }
    }
    this.sendSandboxedPage(res, await this.publications.preview(id, unsaved));
  };

  /** The stored HTML of a published page, opened on its own (exactly what gyftr.com receives). */
  publishedView = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    this.sendSandboxedPage(res, await this.publications.publishedView(id));
  };

  /**
   * Rendered pages are sent as documents carrying their own policy: sandboxed
   * (no access to the panel, its cookies or the API) and allowed to run only
   * their inline script.
   */
  private sendSandboxedPage(res: Response, html: string): void {
    res.removeHeader('X-Frame-Options');
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': [
        'sandbox allow-scripts',
        "default-src 'none'",
        "script-src 'unsafe-inline'",
        "style-src 'unsafe-inline'",
        'img-src * data:',
        'font-src data:',
        "base-uri 'none'",
        "form-action 'none'",
        `frame-ancestors 'self' ${this.panelOrigin}`, // only the panel may frame the preview
      ].join('; '),
      'X-Robots-Tag': 'noindex, nofollow',
    });
    res.send(html);
  }

  /** The saved draft as one self-contained .html file (styles, script and fonts inline). */
  download = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    const { chrome } = parse(z.object({ chrome: z.enum(['0', '1']).default('1') }), req.query);
    const file = await this.publications.download(id, { chrome: chrome === '1' });
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${file.filename}"` });
    res.send(file.html);
  };

  saveAsTemplate = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    res.status(201).json({ template: await this.templates.saveFromPage(actorOf(req), id, parse(saveAsTemplateInputSchema, req.body)) });
  };
}

export class BrandController {
  constructor(private readonly brands: BrandService) {}

  list = async (req: Request, res: Response) => {
    const q = parse(
      paging.extend({
        category: z.string().trim().max(60).optional(),
        active: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
        ids: z
          .string()
          .optional()
          .transform((v) => (v ? v.split(',').slice(0, 200) : undefined))
          .pipe(z.array(z.string().uuid()).optional()),
      }),
      req.query,
    );
    if (q.ids) return res.json({ items: await this.brands.findMany(q.ids), total: q.ids.length, page: 1, pageSize: q.ids.length });
    res.json(await this.brands.query(q));
  };

  categories = async (_req: Request, res: Response) => {
    res.json({ items: await this.brands.categories() });
  };

  get = async (req: Request, res: Response) => {
    res.json({ brand: await this.brands.get(parse(idParam, req.params).id) });
  };

  create = async (req: Request, res: Response) => {
    res.status(201).json({ brand: await this.brands.create(actorOf(req), parse(brandInputSchema, req.body)) });
  };

  update = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    res.json({ brand: await this.brands.update(actorOf(req), id, parse(brandInputSchema, req.body)) });
  };

  remove = async (req: Request, res: Response) => {
    await this.brands.delete(actorOf(req), parse(idParam, req.params).id);
    res.status(204).end();
  };

  importCsv = async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError('Attach a CSV file in the "file" field');
    res.json(await this.brands.importCsv(actorOf(req), req.file.buffer));
  };
}

/**
 * This API's public address, as the browser reached it (e.g. https://api-occasion-admin.gyftr.net).
 * Always https except on a developer machine: deployed, TLS ends at the load balancer.
 */
function apiOrigin(req: Request): string | undefined {
  const host = req.get('host') ?? '';
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return undefined;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  return `${local ? req.protocol : 'https'}://${host.toLowerCase()}`;
}

export class MediaController {
  constructor(private readonly media: MediaService) {}

  list = async (req: Request, res: Response) => {
    res.json(await this.media.list(parse(paging, req.query)));
  };

  upload = async (req: Request, res: Response) => {
    if (!req.file) throw new BadRequestError('Attach an image in the "file" field');
    const { alt } = parse(z.object({ alt: z.string().trim().max(200).default('') }), req.body ?? {});
    const media = await this.media.upload(actorOf(req), { buffer: req.file.buffer, originalName: req.file.originalname }, alt, apiOrigin(req));
    res.status(201).json({ media });
  };

  update = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    const { alt } = parse(z.object({ alt: z.string().trim().max(200) }), req.body);
    res.json({ media: await this.media.updateAlt(actorOf(req), id, alt) });
  };

  remove = async (req: Request, res: Response) => {
    await this.media.delete(actorOf(req), parse(idParam, req.params).id);
    res.status(204).end();
  };
}

export class CatalogController {
  constructor(
    private readonly occasions: OccasionService,
    private readonly templates: TemplateService,
    private readonly site: SiteSettingsService,
    private readonly audit: AuditService,
  ) {}

  listOccasions = async (_req: Request, res: Response) => {
    res.json({ items: await this.occasions.list() });
  };

  createOccasion = async (req: Request, res: Response) => {
    res.status(201).json({ occasion: await this.occasions.create(actorOf(req), parse(occasionInputSchema, req.body)) });
  };

  updateOccasion = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    res.json({ occasion: await this.occasions.update(actorOf(req), id, parse(updateOccasionInputSchema, req.body)) });
  };

  listTemplates = async (req: Request, res: Response) => {
    const { occasionId } = parse(z.object({ occasionId: z.string().uuid().optional() }), req.query);
    const items = await this.templates.list(occasionId);
    res.json({ items: items.map(({ content: _c, ...rest }) => rest) });
  };

  deleteTemplate = async (req: Request, res: Response) => {
    await this.templates.delete(actorOf(req), parse(idParam, req.params).id);
    res.status(204).end();
  };

  getSite = async (_req: Request, res: Response) => {
    res.json({ settings: await this.site.get() });
  };

  updateSite = async (req: Request, res: Response) => {
    res.json({ settings: await this.site.update(actorOf(req), parse(siteSettingsSchema, req.body)) });
  };

  auditLog = async (req: Request, res: Response) => {
    const q = parse(
      paging.extend({ entityType: z.string().max(40).optional(), entityId: z.string().max(64).optional() }),
      req.query,
    );
    res.json(await this.audit.list(q));
  };
}

export class UserController {
  constructor(private readonly users: UserService) {}

  list = async (_req: Request, res: Response) => {
    res.json({ items: await this.users.list() });
  };

  create = async (req: Request, res: Response) => {
    res.status(201).json({ user: await this.users.create(actorOf(req), parse(createUserInputSchema, req.body)) });
  };

  update = async (req: Request, res: Response) => {
    const { id } = parse(idParam, req.params);
    res.json({ user: await this.users.update(actorOf(req), id, parse(updateUserInputSchema, req.body)) });
  };
}
