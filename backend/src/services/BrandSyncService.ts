import { z } from 'zod';
import { GYFTR_ENVIRONMENTS, type GyftrTarget } from '../config/gyftr';
import type { RedemptionMode } from '../contracts';
import { ConflictError, NotFoundError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { SYNCED_BRAND_FIELDS, type BrandRecord, type BrandSyncWrite, type IBrandRepository, type SyncedBrandData } from '../repositories/types';
import type { Actor, AuditService } from './AuditService';
import type { IContentChangeNotifier } from './ContentChanges';

/** The GyFTR sites a brand card can link to: a link to one of them for the brand's slug was made by the panel. */
const GYFTR_SITES: readonly string[] = Object.values(GYFTR_ENVIRONMENTS).map((e) => e.brandPageBase);

export interface BrandSyncResult {
  /** Brands listed by GyFTR. */
  listed: number;
  created: number;
  updated: number;
  unchanged: number;
  /** Brands no longer listed by GyFTR, switched to inactive. */
  deactivated: number;
  /** Brands whose detail (discount, redemption) could not be fetched; their other data was still synced. */
  detailsFailed: number;
}

export interface BrandSyncStatus {
  running: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  result: BrandSyncResult | null;
  error: string | null;
}

export type JsonFetcher = (url: string) => Promise<unknown>;

const listSchema = z.object({
  data: z.object({
    brands: z.array(z.unknown()),
  }),
});
const listedBrandSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().trim().min(1).max(120),
  brand_name: z.string().trim().min(1),
  logo: z.string().nullish(),
  is_visible: z.number().nullish(),
  is_published: z.number().nullish(),
});
const detailSchema = z.object({
  data: z.object({
    brand: z.object({
      brand_name: z.string().nullish(),
      brand_logo: z.string().nullish(),
      redemption_type: z.string().nullish(),
      defaut_pg_dis: z.union([z.number(), z.string()]).nullish(),
    }),
  }),
});

type ListedBrand = z.infer<typeof listedBrandSchema>;
interface BrandDetail {
  name?: string;
  logoUrl?: string;
  discountPercent: number | null;
  redemption?: RedemptionMode;
}

const REDEMPTION: Record<string, RedemptionMode> = { ON: 'ONLINE', OFF: 'OFFLINE', B: 'BOTH' };
const httpsUrl = (url: string | null | undefined) => (url && /^https:\/\//.test(url.trim()) ? url.trim() : '');

/** GyFTR's API answered with an error status. */
export class GyftrApiError extends Error {
  constructor(readonly status: number, url: string) {
    super(`GyFTR API answered ${status} for ${url}`);
  }
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new GyftrApiError(res.status, url);
  return res.json();
}

/** Worth asking again: a timeout, a network error or a 5xx. A 4xx (e.g. a slug GyFTR rejects) is not. */
const isTransient = (err: unknown) => !(err instanceof GyftrApiError && err.status < 500);

/** Runs `fn` over `items`, at most `limit` at a time. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Keeps the brand library in step with GyFTR's brand API (production or staging, see config/gyftr.ts):
 *   - the list (…/home/brand/list) gives every brand: id, name, slug, logo, visibility;
 *   - each brand's detail (…/brand/detail/:slug) gives its discount (`defaut_pg_dis`) and redemption.
 * A brand's slug follows GyFTR's and its card links to the GyFTR site's page for it (`${brandPageBase}/${slug}`).
 * Brands from this API are matched on GyFTR's id; every other brand (added by hand, or synced from the other
 * GyFTR environment, whose ids mean other brands) is matched on its slug. A field an editor changed by hand
 * (BrandRecord.manualFields) is never overwritten; category and discount label are the panel's own.
 *
 * Runs in the background after each sign-in to the panel and on demand. One sync at a time:
 * a request made while one is running joins it.
 */
export class BrandSyncService {
  private running: Promise<BrandSyncResult | null> | null = null;
  private status: Omit<BrandSyncStatus, 'running'> = { startedAt: null, finishedAt: null, result: null, error: null };

  constructor(
    private readonly brands: IBrandRepository,
    private readonly changes: IContentChangeNotifier,
    private readonly audit: AuditService,
    private readonly logger: Logger,
    private readonly target: Pick<GyftrTarget, 'apiBase' | 'source' | 'brandPageBase'>,
    private readonly fetchJson: JsonFetcher = defaultFetchJson,
    private readonly concurrency = 6,
  ) {}

  getStatus(): BrandSyncStatus {
    return { ...this.status, running: this.running !== null };
  }

  /** Starts a sync, or joins the running one. Never throws: a failure is logged and kept in the status. */
  start(actor: Actor | null): Promise<BrandSyncResult | null> {
    if (this.running) return this.running;
    this.status = { ...this.status, startedAt: new Date(), error: null };
    this.running = this.sync(actor)
      .then((result) => {
        this.status = { ...this.status, finishedAt: new Date(), result };
        this.logger.info(result, 'Brands synced from GyFTR');
        return result;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.status = { ...this.status, finishedAt: new Date(), error: message };
        this.logger.error({ err }, 'Brand sync from GyFTR failed');
        return null;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  /**
   * Switches off, right away, the brands synced from another GyFTR brand API (when the API in the settings changes),
   * so pages never show them, even before the next sync. Run at start-up.
   */
  async hideOtherSources(): Promise<number> {
    const count = await this.brands.deactivateOtherSources(this.target.source);
    if (count) {
      this.changes.changed('brands'); // published pages are re-rendered without them
      this.logger.info({ count }, 'Brands from another GyFTR brand API switched off');
    }
    return count;
  }

  /** Clears a brand's hand-made changes and takes its data from GyFTR again right away. */
  async resetToGyftr(actor: Actor, id: string): Promise<BrandRecord> {
    const brand = await this.brands.findById(id);
    if (!brand) throw new NotFoundError('Brand');
    if (brand.gyftrId === null) throw new ConflictError('This brand was added by hand; it does not come from GyFTR.');
    if (brand.gyftrSource !== this.target.source) {
      throw new NotFoundError('Brand');
    }
    const detail = await this.detail(brand.slug);
    const data: Partial<SyncedBrandData> = {
      productUrl: this.brandPage(brand.slug),
      ...(detail.name ? { name: detail.name } : {}),
      ...(detail.logoUrl ? { logoUrl: detail.logoUrl } : {}),
      discountPercent: detail.discountPercent,
      ...(detail.redemption ? { redemption: detail.redemption } : {}),
    };
    await this.brands.saveSync({ creates: [], updates: [{ id, data }] });
    const updated = await this.brands.setManualFields(id, []);
    this.changes.changed('brands');
    await this.audit.record(actor, { action: 'brand.reset', entityType: 'brand', entityId: id, metadata: { slug: brand.slug, cleared: brand.manualFields } });
    return updated;
  }

  private async sync(actor: Actor | null): Promise<BrandSyncResult> {
    const listed = await this.list();
    const details = new Map<number, BrandDetail | null>();
    let detailsFailed = 0;
    await mapLimit(
      listed.filter((b) => b.is_visible !== 0),
      this.concurrency,
      async (b) => {
        try {
          details.set(b.id, await this.detail(b.slug).catch(async (err: unknown) => {
            if (!isTransient(err)) throw err;
            await new Promise((resolve) => setTimeout(resolve, 500));
            return this.detail(b.slug); // once more
          }));
        } catch (err) {
          detailsFailed++;
          details.set(b.id, null);
          this.logger.warn({ err, slug: b.slug }, 'Could not fetch brand detail from GyFTR');
        }
      },
    );

    const existing = await this.brands.all();
    const { source } = this.target;
    // GyFTR ids only mean something within one API: brands from this API are matched on id, every other brand
    // (added by hand, or from the other GyFTR environment) on its slug.
    const ours = new Map(existing.filter((b) => b.gyftrSource === source && b.gyftrId !== null).map((b) => [b.gyftrId!, b]));
    const othersBySlug = new Map(existing.filter((b) => b.gyftrSource !== source || b.gyftrId === null).map((b) => [b.slug, b]));
    const startSlugs = new Set(existing.map((b) => b.slug));
    const slugOwner = new Map(existing.map((b) => [b.slug, b.id])); // slugs are unique: who holds each one after this sync
    const write: BrandSyncWrite = { creates: [], updates: [] };
    const result: BrandSyncResult = { listed: listed.length, created: 0, updated: 0, unchanged: 0, deactivated: 0, detailsFailed };
    const seen = new Set<number>();
    const listedBrandIds = new Set<string>();

    for (const item of listed) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const detail = details.get(item.id) ?? null;
      const wanted: Partial<SyncedBrandData> = {
        name: (detail?.name || item.brand_name).slice(0, 120),
        slug: item.slug,
        logoUrl: httpsUrl(item.logo) || detail?.logoUrl || '',
        isActive: item.is_visible !== 0 && item.is_published !== 0,
        ...(detail ? { discountPercent: detail.discountPercent } : {}),
        ...(detail?.redemption ? { redemption: detail.redemption } : {}),
      };
      const current = ours.get(item.id) ?? othersBySlug.get(item.slug);
      if (!current) {
        // The slug belongs to another brand (or did when the sync started): never two brands with one slug.
        if (slugOwner.has(item.slug) || startSlugs.has(item.slug)) {
          this.logger.warn({ slug: item.slug, gyftrId: item.id }, 'GyFTR brand not added: another brand has its slug');
          continue;
        }
        slugOwner.set(item.slug, `new:${item.id}`);
        write.creates.push({
          gyftrId: item.id,
          gyftrSource: source,
          slug: item.slug,
          name: wanted.name!,
          logoUrl: wanted.logoUrl!,
          productUrl: this.brandPage(item.slug),
          discountPercent: wanted.discountPercent ?? null,
          discountLabel: '',
          category: '',
          redemption: wanted.redemption ?? 'BOTH',
          minDenomination: null,
          isActive: wanted.isActive!,
        });
        result.created++;
        continue;
      }
      listedBrandIds.add(current.id);
      othersBySlug.delete(current.slug);
      const data = this.changedFields(current, wanted);
      // A new slug only when no other brand holds it; the link then follows the slug the brand keeps.
      if (data.slug !== undefined) {
        const owner = slugOwner.get(data.slug);
        if (owner !== undefined && owner !== current.id) {
          this.logger.warn({ slug: data.slug, brand: current.slug }, 'GyFTR slug not taken over: another brand has it');
          delete data.slug;
        } else {
          slugOwner.delete(current.slug);
          slugOwner.set(data.slug, current.id);
        }
      }
      const link = this.brandPage(data.slug ?? current.slug);
      if (!current.manualFields.includes('productUrl') && this.isPanelLink(current.productUrl, current.slug) && current.productUrl !== link) {
        data.productUrl = link;
      }
      // From now on it comes from this API.
      if (current.gyftrSource !== source || current.gyftrId !== item.id) Object.assign(data, { gyftrId: item.id, gyftrSource: source });
      if (Object.keys(data).length) {
        write.updates.push({ id: current.id, data });
        result.updated++;
      } else {
        result.unchanged++;
      }
    }

    // Not listed by this API: switched off so pages stop showing it, never deleted. A brand this API dropped stays on
    // if an editor decided so; one from another GyFTR brand API is always switched off. Brands added by hand are left alone.
    for (const brand of existing) {
      if (brand.gyftrId === null || listedBrandIds.has(brand.id) || !brand.isActive) continue;
      if (brand.gyftrSource === source && brand.manualFields.includes('isActive')) continue;
      write.updates.push({ id: brand.id, data: { isActive: false } });
      result.deactivated++;
    }

    await this.brands.saveSync(write);
    if (write.creates.length || write.updates.length) this.changes.changed('brands'); // live pages show the new data
    await this.audit.record(actor, { action: 'brand.sync', entityType: 'brand', entityId: null, metadata: { ...result } });
    return result;
  }

  /** The brand's page on the GyFTR site this panel follows. */
  private brandPage(slug: string): string {
    return `${this.target.brandPageBase}/${slug}`;
  }

  /** A link the panel made itself (a GyFTR site's page for the slug, or none), as opposed to one an editor typed. */
  private isPanelLink(url: string, slug: string): boolean {
    return !url || [...GYFTR_SITES, this.target.brandPageBase].some((site) => url === `${site}/${slug}`);
  }

  /** The synced fields whose GyFTR value differs from the brand's, minus those changed by hand. */
  private changedFields(current: BrandRecord, wanted: Partial<SyncedBrandData>): Partial<SyncedBrandData> {
    const data: Record<string, unknown> = {};
    for (const field of SYNCED_BRAND_FIELDS) {
      const value = wanted[field];
      if (value === undefined || current.manualFields.includes(field)) continue;
      if (current[field] !== value) data[field] = value;
    }
    return data as Partial<SyncedBrandData>;
  }

  private async list(): Promise<ListedBrand[]> {
    const body = listSchema.safeParse(await this.fetchJson(`${this.target.apiBase}/home/brand/list`));
    if (!body.success) throw new Error('GyFTR brand list has an unexpected format');
    const brands: ListedBrand[] = [];
    for (const raw of body.data.data.brands) {
      const parsed = listedBrandSchema.safeParse(raw);
      if (parsed.success) brands.push(parsed.data);
    }
    if (brands.length === 0) throw new Error('GyFTR brand list is empty'); // never switch every brand off because of a bad answer
    return brands;
  }

  private async detail(slug: string): Promise<BrandDetail> {
    const body = detailSchema.safeParse(await this.fetchJson(`${this.target.apiBase}/brand/detail/${encodeURIComponent(slug)}`));
    if (!body.success) throw new Error(`GyFTR detail for "${slug}" has an unexpected format`);
    const b = body.data.data.brand;
    const discount = Number(b.defaut_pg_dis);
    return {
      name: b.brand_name?.trim().slice(0, 120) || undefined,
      logoUrl: httpsUrl(b.brand_logo) || undefined,
      discountPercent: Number.isFinite(discount) && discount > 0 ? Math.min(100, Math.round(discount * 100) / 100) : null,
      redemption: REDEMPTION[(b.redemption_type ?? '').toUpperCase()],
    };
  }
}
