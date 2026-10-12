import type { PageUrlPolicy } from '../domain/pages/PageUrlPolicy';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { IImageInliner } from '../render/ImageInliner';
import type { IPageRenderer, RenderedFragment } from '../render/PageRenderer';
import type { IPageRepository, IPublicationRepository, PageRecord } from '../repositories/types';
import type { Actor } from './AuditService';
import type { PagePayloadService } from './PagePayloadService';
import type { PageDetail, PageService } from './PageService';

export interface PublicationOptions {
  /** Reject pages whose images are not served over https (browsers block mixed content on gyftr.com). */
  requireHttpsImages: boolean;
  /** How long to wait before re-trying pages that could not be re-rendered. Default 60 s. */
  retryDelayMs?: number;
}

export interface RefreshResult {
  /** Pages whose stored HTML changed. */
  refreshed: number;
  /** Pages whose HTML came out identical: nothing was written. */
  unchanged: number;
  failed: number;
}

const MAX_REFRESH_RETRIES = 3;

/**
 * Everything that turns a page into HTML for the outside world:
 *  - publishing renders the embeddable HTML, which is stored together with the page (the gyftr.com backend reads it from the database),
 *  - a brand / site-settings change re-renders every published page,
 *  - previews and downloads render a standalone document on demand.
 */
export class PublicationService {
  private refreshing: Promise<RefreshResult> | null = null;
  private refreshQueued = false;
  private retries = 0;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly pageService: PageService,
    private readonly pages: IPageRepository,
    private readonly publications: IPublicationRepository,
    private readonly payloads: PagePayloadService,
    private readonly renderer: IPageRenderer,
    private readonly images: IImageInliner,
    private readonly urls: PageUrlPolicy,
    private readonly logger: Logger,
    private readonly options: PublicationOptions,
  ) {}

  /**
   * Publish = render first, then store the page state and its HTML in one
   * transaction. A page that cannot be rendered is never published, and the
   * panel status can never disagree with what gyftr.com reads.
   */
  async publish(actor: Actor, id: string, expectedVersion: number, note = ''): Promise<PageDetail> {
    const page = await this.requirePage(id);
    if (page.draftVersion !== expectedVersion) {
      throw new ConflictError('This page was changed by someone else since you opened it. Reload to get the latest version.', { reason: 'STALE_VERSION' });
    }
    const rendered = await this.render(page, page.draft, page.slug);
    const published = await this.pageService.publish(actor, id, expectedVersion, note, { html: rendered.html, seo: rendered.seo });
    // A brand may have changed between the render and the commit; one more pass settles it (no write when identical).
    await this.refreshPage(published).catch((err: unknown) => this.logger.error({ err, pageId: id }, 'Could not re-check the page after publishing'));
    return published;
  }

  /** Status change and removal of the stored HTML happen in one transaction (PageRepository.setStatus). */
  unpublish(actor: Actor, id: string): Promise<PageDetail> {
    return this.pageService.unpublish(actor, id);
  }

  archive(actor: Actor, id: string): Promise<PageDetail> {
    return this.pageService.archive(actor, id);
  }

  /**
   * Re-render every published page from its published snapshot with today's
   * brand data and site settings. One failing page never stops the others.
   *
   * Calls made while a pass is running are folded into ONE follow-up pass, so a
   * burst of brand edits costs two passes, not one each. Pages that fail are
   * retried a few times after a delay.
   */
  refreshAll(): Promise<RefreshResult> {
    if (this.refreshing) {
      this.refreshQueued = true;
      return this.refreshing;
    }
    this.refreshing = this.refreshUntilSettled().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** Standalone preview of the saved draft, or of unsaved editor content when given. */
  async preview(id: string, unsavedContent?: unknown): Promise<string> {
    const page = await this.requirePage(id);
    const content = unsavedContent === undefined ? page.draft : this.pageService.validateContent(unsavedContent);
    const data = await this.payloads.build(page, content, page.slug);
    return this.renderer.renderDocument(data, this.urls.toUrl(page.slug), { chrome: true, preview: true });
  }

  /**
   * What is currently stored for a published page, wrapped in a bare document so
   * it can be opened in a browser: exactly the HTML gyftr.com receives,
   * with nothing around it.
   */
  async publishedView(id: string): Promise<string> {
    const stored = await this.publications.findByPageId(id);
    if (!stored) throw new NotFoundError('Published page');
    const title = stored.seo.title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<!doctype html>\n<html lang="en-IN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex, nofollow">\n<title>${title}</title>\n</head>\n<body style="margin:0">\n${stored.html}\n</body>\n</html>\n`;
  }

  /** The saved draft as ONE self-contained HTML file: styles, script, fonts and images are all inside it. */
  async download(id: string, opts: { chrome: boolean }): Promise<{ filename: string; html: string }> {
    const page = await this.requirePage(id);
    const data = await this.payloads.build(page, page.draft, page.slug);
    const html = this.renderer.renderDocument(data, this.urls.toUrl(page.slug), { chrome: opts.chrome });
    return { filename: `${page.slug}.html`, html: await this.images.inline(html) };
  }

  /* ---------- internals ---------- */

  private async refreshUntilSettled(): Promise<RefreshResult> {
    let result: RefreshResult;
    do {
      this.refreshQueued = false;
      result = await this.refreshOnce();
    } while (this.refreshQueued);

    if (result.failed === 0) this.retries = 0;
    else if (this.retries < MAX_REFRESH_RETRIES && !this.retryTimer) {
      this.retries++;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.refreshAll().catch((err: unknown) => this.logger.error({ err }, 'Retry of page re-rendering failed'));
      }, this.options.retryDelayMs ?? 60_000);
      this.retryTimer.unref();
    }
    return result;
  }

  private async refreshOnce(): Promise<RefreshResult> {
    const result: RefreshResult = { refreshed: 0, unchanged: 0, failed: 0 };
    for (const page of await this.pages.listPublished()) {
      try {
        const outcome = await this.refreshPage(page);
        if (outcome === 'updated') result.refreshed++;
        else if (outcome === 'unchanged') result.unchanged++;
      } catch (err) {
        result.failed++;
        this.logger.error({ err, pageId: page.id, slug: page.publishedSlug }, 'Could not re-render published page');
      }
    }
    this.logger.info(result, 'Re-rendered published pages');
    return result;
  }

  private async refreshPage(page: PageRecord) {
    const { published, publishedSlug, publishedVersion } = page;
    if (!publishedSlug || publishedVersion === null || published === null) return 'gone' as const;
    return this.publications.refresh(page.id, publishedVersion, async () => {
      const { html, seo } = await this.render(page, published, publishedSlug);
      return { html, seo };
    });
  }

  private async requirePage(id: string): Promise<PageRecord> {
    const page = await this.pages.findById(id);
    if (!page) throw new NotFoundError('Page');
    return page;
  }

  private async render(page: PageRecord, content: unknown, slug: string): Promise<RenderedFragment> {
    const data = await this.payloads.build(page, content, slug);
    const rendered = this.renderer.renderFragment(data, this.urls.toUrl(slug));
    if (this.options.requireHttpsImages) {
      const insecure = rendered.images.filter((url) => /^http:\/\//i.test(url));
      if (insecure.length) {
        throw new ValidationError('Page cannot be published yet', {
          problems: [`${insecure.length} image(s) are not served over https and would be blocked on gyftr.com: ${insecure.slice(0, 5).join(', ')}`],
        });
      }
    }
    return rendered;
  }
}
