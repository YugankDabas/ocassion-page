import { z } from 'zod';
import type { RedemptionMode } from '../contracts';
import { ConflictError, NotFoundError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { SYNCED_BRAND_FIELDS, type BrandRecord, type BrandSyncWrite, type IBrandRepository, type SyncedBrandData } from '../repositories/types';
import type { Actor, AuditService } from './AuditService';
import type { IContentChangeNotifier } from './ContentChanges';

/** GyFTR's public brand API. */
export const GYFTR_API = 'https://api.gyftr.com/gyftrapi/api/v1';

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
 * Keeps the brand library in step with GyFTR's brand API:
 *   - the list (https://api.gyftr.com/.../home/brand/list) gives every brand: name, slug, logo, visibility;
 *   - each brand's detail (.../brand/detail/:slug) gives its discount (`defaut_pg_dis`) and redemption.
 * Brands are matched on GyFTR's id. A field an editor changed by hand (BrandRecord.manualFields) is
 * never overwritten; category, discount label and voucher-page link are the panel's own.
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
    private readonly productUrlBase = 'https://www.gyftr.com',
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

  /** Clears a brand's hand-made changes and takes its data from GyFTR again right away. */
  async resetToGyftr(actor: Actor, id: string): Promise<BrandRecord> {
    const brand = await this.brands.findById(id);
    if (!brand) throw new NotFoundError('Brand');
    if (brand.gyftrId === null) throw new ConflictError('This brand was added by hand; it does not come from GyFTR.');
    const detail = await this.detail(brand.slug);
    const data: Partial<SyncedBrandData> = {
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
    const byGyftrId = new Map(existing.filter((b) => b.gyftrId !== null).map((b) => [b.gyftrId!, b]));
    const handMadeBySlug = new Map(existing.filter((b) => b.gyftrId === null).map((b) => [b.slug, b]));
    const takenSlugs = new Set(existing.map((b) => b.slug));
    const write: BrandSyncWrite = { creates: [], updates: [] };
    const result: BrandSyncResult = { listed: listed.length, created: 0, updated: 0, unchanged: 0, deactivated: 0, detailsFailed };
    const seen = new Set<number>();

    for (const item of listed) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const detail = details.get(item.id) ?? null;
      const wanted: Partial<SyncedBrandData> = {
        name: (detail?.name || item.brand_name).slice(0, 120),
        logoUrl: httpsUrl(item.logo) || detail?.logoUrl || '',
        isActive: item.is_visible !== 0 && item.is_published !== 0,
        ...(detail ? { discountPercent: detail.discountPercent } : {}),
        ...(detail?.redemption ? { redemption: detail.redemption } : {}),
      };
      const current = byGyftrId.get(item.id) ?? handMadeBySlug.get(item.slug);
      if (!current) {
        if (takenSlugs.has(item.slug)) continue; // the slug belongs to another GyFTR brand already
        takenSlugs.add(item.slug);
        write.creates.push({
          gyftrId: item.id,
          slug: item.slug,
          name: wanted.name!,
          logoUrl: wanted.logoUrl!,
          productUrl: `${this.productUrlBase}/${item.slug}`,
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
      const data = this.changedFields(current, wanted);
      if (current.gyftrId === null) Object.assign(data, { gyftrId: item.id }); // a brand added by hand before: from now on it comes from GyFTR
      if (Object.keys(data).length) {
        write.updates.push({ id: current.id, data });
        result.updated++;
      } else {
        result.unchanged++;
      }
    }

    // No longer listed by GyFTR: switched off (pages stop showing it), unless an editor decided otherwise.
    for (const brand of existing) {
      if (brand.gyftrId === null || seen.has(brand.gyftrId) || !brand.isActive || brand.manualFields.includes('isActive')) continue;
      write.updates.push({ id: brand.id, data: { isActive: false } });
      result.deactivated++;
    }

    await this.brands.saveSync(write);
    if (write.creates.length || write.updates.length) this.changes.changed('brands'); // live pages show the new data
    await this.audit.record(actor, { action: 'brand.sync', entityType: 'brand', entityId: null, metadata: { ...result } });
    return result;
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
    const body = listSchema.safeParse(await this.fetchJson(`${GYFTR_API}/home/brand/list`));
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
    const body = detailSchema.safeParse(await this.fetchJson(`${GYFTR_API}/brand/detail/${encodeURIComponent(slug)}`));
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
