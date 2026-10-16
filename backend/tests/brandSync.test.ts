import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../src/lib/errors';
import type { BrandRecord, BrandSyncWrite, IBrandRepository } from '../src/repositories/types';
import { AuditService } from '../src/services/AuditService';
import { BrandService } from '../src/services/BrandService';
import { BrandSyncService, GyftrApiError } from '../src/services/BrandSyncService';
import { gyftrTarget, type GyftrTarget } from '../src/config/gyftr';
import { brand, noAudit, silentLogger } from './fakes';

/** Brand repository in memory, with what the sync and the edit form use. */
class SyncBrandRepository {
  constructor(public brands: BrandRecord[] = []) {}
  writes: BrandSyncWrite[] = [];
  async all() {
    return [...this.brands];
  }
  async findById(id: string) {
    return this.brands.find((b) => b.id === id) ?? null;
  }
  async findBySlug(slug: string) {
    return this.brands.find((b) => b.slug === slug) ?? null;
  }
  async update(id: string, data: Partial<BrandRecord>) {
    const b = this.brands.find((x) => x.id === id)!;
    Object.assign(b, data);
    return b;
  }
  async upsertBySlug(data: Partial<BrandRecord> & { slug: string }) {
    const existing = await this.findBySlug(data.slug);
    if (existing) return { record: Object.assign(existing, data), created: false };
    const record = brand({ ...data, id: randomUUID() });
    this.brands.push(record);
    return { record, created: true };
  }
  async saveSync(write: BrandSyncWrite) {
    this.writes.push(write);
    for (const c of write.creates) this.brands.push(brand({ ...c, id: randomUUID(), syncedAt: new Date() }));
    for (const u of write.updates) Object.assign(this.brands.find((b) => b.id === u.id)!, u.data, { syncedAt: new Date() });
  }
  async delete(id: string) {
    this.brands = this.brands.filter((b) => b.id !== id);
  }
  async deactivateOtherSources(source: string) {
    const others = this.brands.filter((b) => b.isActive && b.gyftrSource !== null && b.gyftrSource !== source);
    for (const b of others) b.isActive = false;
    return others.length;
  }
  async setManualFields(id: string, manualFields: string[]) {
    return this.update(id, { manualFields });
  }
}

const listed = (id: number, slug: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug,
  brand_name: name,
  logo: `https://cdn.gyftr.com/${slug}.png`,
  is_visible: 1,
  is_published: 1,
  ...extra,
});
const detail = (name: string, discount: number | string | null, redemption = 'ON') => ({
  data: { brand: { brand_name: name, brand_logo: null, redemption_type: redemption, defaut_pg_dis: discount } },
});

const PROD = gyftrTarget({ ADMIN_FRONTEND_ORIGIN: 'https://occasion-admin.gyftr.com' });
const STAGING = gyftrTarget({ ADMIN_FRONTEND_ORIGIN: 'https://occasion-admin.gyftr.net' });
const GYFTR_API = PROD.apiBase;

/** Answers like GyFTR's API: the list, and a detail per slug (an Error answer is thrown). */
function gyftr(list: unknown[], details: Record<string, unknown>, apiBase = GYFTR_API) {
  const calls: string[] = [];
  const fetchJson = async (url: string) => {
    calls.push(url);
    if (url === `${apiBase}/home/brand/list`) return { data: { brands: list } };
    if (!url.startsWith(`${apiBase}/brand/detail/`)) throw new Error(`unexpected address ${url}`);
    const slug = decodeURIComponent(url.slice(`${apiBase}/brand/detail/`.length));
    const answer = details[slug];
    if (answer instanceof Error || answer === undefined) throw answer ?? new Error(`no detail for ${slug}`);
    return answer;
  };
  return { fetchJson, calls };
}

function setup(existing: BrandRecord[], api: ReturnType<typeof gyftr>, target: GyftrTarget = PROD) {
  // Brands given a GyFTR id here came from the production API (as every brand synced before staging did).
  for (const b of existing) if (b.gyftrId !== null && b.gyftrSource === null) b.gyftrSource = PROD.source;
  const repo = new SyncBrandRepository(existing);
  const changed: string[] = [];
  const changes = { changed: (what: string) => void changed.push(what) };
  const audit = new AuditService(noAudit, silentLogger);
  const sync = new BrandSyncService(repo as unknown as IBrandRepository, changes as never, audit, silentLogger, target, api.fetchJson, 2);
  const service = new BrandService(repo as unknown as IBrandRepository, changes as never, audit, target.brandPageBase, target.source);
  return { repo, sync, service, changed };
}

const actor = { id: randomUUID(), email: 'editor@gyftr.net' } as never;

describe('Brand sync from GyFTR', () => {
  it('creates every listed brand with the discount from defaut_pg_dis and the slug in the detail address', async () => {
    const api = gyftr([listed(1, 'amazon-pay', 'Amazon Pay'), listed(2, 'myntra', 'Myntra')], {
      'amazon-pay': detail('Amazon Pay', 0.5, 'ON'),
      myntra: detail('Myntra', '7', 'B'),
    });
    const { repo, sync, changed } = setup([], api);
    expect(await sync.start(actor)).toEqual({ listed: 2, created: 2, updated: 0, unchanged: 0, deactivated: 0, detailsFailed: 0 });
    expect(api.calls).toContain(`${GYFTR_API}/brand/detail/amazon-pay`);
    expect(api.calls).toContain(`${GYFTR_API}/brand/detail/myntra`);
    const amazon = repo.brands.find((b) => b.slug === 'amazon-pay')!;
    expect(amazon).toMatchObject({ gyftrId: 1, name: 'Amazon Pay', discountPercent: 0.5, redemption: 'ONLINE', isActive: true, productUrl: 'https://www.gyftr.com/amazon-pay', logoUrl: 'https://cdn.gyftr.com/amazon-pay.png' });
    expect(repo.brands.find((b) => b.slug === 'myntra')).toMatchObject({ discountPercent: 7, redemption: 'BOTH' });
    expect(changed).toEqual(['brands']); // live pages are re-rendered
    expect(sync.getStatus()).toMatchObject({ running: false, error: null, result: { created: 2 } });
  });

  it('updates changed data, leaves the same data alone, and stores no discount for 0', async () => {
    const api = gyftr([listed(1, 'amazon-pay', 'Amazon Pay'), listed(2, 'myntra', 'Myntra')], {
      'amazon-pay': detail('Amazon Pay', 0, 'ON'),
      myntra: detail('Myntra', 7, 'B'),
    });
    const amazon = brand({ gyftrId: 1, slug: 'amazon-pay', name: 'Amazon', discountPercent: 2, redemption: 'ONLINE', logoUrl: 'https://cdn.gyftr.com/amazon-pay.png' });
    const myntra = brand({ gyftrId: 2, slug: 'myntra', name: 'Myntra', discountPercent: 7, redemption: 'BOTH', logoUrl: 'https://cdn.gyftr.com/myntra.png' });
    const { repo, sync } = setup([amazon, myntra], api);
    expect(await sync.start(actor)).toMatchObject({ created: 0, updated: 1, unchanged: 1 });
    expect(repo.writes[0]!.updates).toEqual([{ id: amazon.id, data: { name: 'Amazon Pay', discountPercent: null } }]);
  });

  it('never overwrites a field edited by hand, and keeps the panel’s own fields', async () => {
    const api = gyftr([listed(1, 'amazon-pay', 'Amazon Pay')], { 'amazon-pay': detail('Amazon Pay', 3, 'ON') });
    const amazon = brand({ gyftrId: 1, slug: 'amazon-pay', name: 'Amazon Pay', discountPercent: 10, category: 'Shopping', discountLabel: 'Flat 10%', manualFields: ['discountPercent'] });
    const { repo, sync } = setup([amazon], api);
    await sync.start(actor);
    expect(repo.brands[0]).toMatchObject({ discountPercent: 10, category: 'Shopping', discountLabel: 'Flat 10%' });
  });

  it('switches off a brand GyFTR no longer lists or shows, unless its status was set by hand', async () => {
    const api = gyftr([listed(1, 'amazon-pay', 'Amazon Pay'), listed(3, 'hidden', 'Hidden', { is_visible: 0 })], { 'amazon-pay': detail('Amazon Pay', 1) });
    const gone = brand({ gyftrId: 2, slug: 'gone' });
    const kept = brand({ gyftrId: 4, slug: 'kept', manualFields: ['isActive'] });
    const handMade = brand({ slug: 'my-own-brand' });
    const { repo, sync } = setup([gone, kept, handMade], api);
    expect(await sync.start(actor)).toMatchObject({ created: 2, deactivated: 1 });
    expect(repo.brands.find((b) => b.slug === 'gone')!.isActive).toBe(false);
    expect(repo.brands.find((b) => b.slug === 'kept')!.isActive).toBe(true);
    expect(repo.brands.find((b) => b.slug === 'my-own-brand')!.isActive).toBe(true); // added by hand: not GyFTR's to switch off
    expect(repo.brands.find((b) => b.slug === 'hidden')!.isActive).toBe(false);
    expect(api.calls).not.toContain(`${GYFTR_API}/brand/detail/hidden`); // no detail fetched for a hidden brand
  });

  it('adopts a brand added by hand with the same slug instead of adding it twice', async () => {
    const api = gyftr([listed(9, 'amazon', 'Amazon Pay')], { amazon: detail('Amazon Pay', 1) });
    const handMade = brand({ slug: 'amazon', name: 'Amazon' });
    const { repo, sync } = setup([handMade], api);
    expect(await sync.start(actor)).toMatchObject({ created: 0, updated: 1 });
    expect(repo.brands).toHaveLength(1);
    expect(repo.brands[0]).toMatchObject({ id: handMade.id, gyftrId: 9, name: 'Amazon Pay', discountPercent: 1 });
  });

  it('still syncs the list when a detail fails, keeping that brand’s discount', async () => {
    const api = gyftr([listed(1, 'amazon-pay', 'Amazon Pay')], { 'amazon-pay': new Error('timeout') });
    const amazon = brand({ gyftrId: 1, slug: 'amazon-pay', name: 'Old name', discountPercent: 4 });
    const { repo, sync } = setup([amazon], api);
    expect(await sync.start(actor)).toMatchObject({ updated: 1, detailsFailed: 1 });
    expect(repo.brands[0]).toMatchObject({ name: 'Amazon Pay', discountPercent: 4 });
  });

  it('asks again once when GyFTR answers with a server error, but not for a slug it rejects', async () => {
    const calls: string[] = [];
    let porterFailures = 1;
    const fetchJson = async (url: string) => {
      calls.push(url);
      if (url.endsWith('/home/brand/list')) return { data: { brands: [listed(1, 'porter', 'Porter'), listed(2, 'black-+-decker', 'Black + Decker')] } };
      if (url.endsWith('/porter') && porterFailures-- > 0) throw new GyftrApiError(502, url);
      if (url.includes('decker')) throw new GyftrApiError(400, url);
      return detail('Porter', 5);
    };
    const { repo, sync } = setup([], { fetchJson, calls });
    expect(await sync.start(actor)).toMatchObject({ created: 2, detailsFailed: 1 });
    expect(calls.filter((u) => u.endsWith('/porter'))).toHaveLength(2);
    expect(calls.filter((u) => u.includes('decker'))).toHaveLength(1);
    expect(repo.brands.find((b) => b.slug === 'porter')!.discountPercent).toBe(5);
    expect(repo.brands.find((b) => b.slug === 'black-+-decker')).toMatchObject({ name: 'Black + Decker', discountPercent: null });
  });

  it('changes nothing when the list fails or is empty, and reports the error', async () => {
    const amazon = brand({ gyftrId: 1, slug: 'amazon-pay' });
    for (const api of [gyftr([], {}), { fetchJson: async () => Promise.reject(new Error('GyFTR API answered 502')), calls: [] }]) {
      const { repo, sync } = setup([{ ...amazon }], api);
      expect(await sync.start(actor)).toBeNull(); // never throws
      expect(repo.writes).toEqual([]);
      expect(repo.brands[0]!.isActive).toBe(true);
      expect(sync.getStatus().error).toBeTruthy();
    }
  });

  it('runs one sync at a time', async () => {
    const api = gyftr([listed(1, 'amazon-pay', 'Amazon Pay')], { 'amazon-pay': detail('Amazon Pay', 1) });
    const { sync } = setup([], api);
    const first = sync.start(actor);
    expect(sync.getStatus().running).toBe(true);
    expect(sync.start(actor)).toBe(first);
    await first;
    expect(api.calls.filter((u) => u.endsWith('/home/brand/list'))).toHaveLength(1);
    expect(sync.getStatus().running).toBe(false);
  });

  it('remembers fields edited by hand, and “use GyFTR data again” clears them', async () => {
    const api = gyftr([listed(1, 'amazon-pay', 'Amazon Pay')], { 'amazon-pay': detail('Amazon Pay', 1.5, 'ON') });
    const { repo, sync, service } = setup([], api);
    await sync.start(actor);
    const amazon = repo.brands[0]!;
    const input = { name: amazon.name, slug: 'ignored-for-gyftr', logoUrl: amazon.logoUrl, productUrl: amazon.productUrl, discountPercent: 12, discountLabel: '', category: 'Shopping', redemption: amazon.redemption, minDenomination: null, isActive: true };
    await service.update(actor, amazon.id, input);
    expect(amazon).toMatchObject({ slug: 'amazon-pay', discountPercent: 12, category: 'Shopping', manualFields: ['discountPercent'] }); // category is the panel’s own

    await sync.start(actor);
    expect(amazon.discountPercent).toBe(12); // the sync keeps the hand-made value

    await sync.resetToGyftr(actor, amazon.id);
    expect(amazon).toMatchObject({ discountPercent: 1.5, manualFields: [] });
  });

  it('a GyFTR brand cannot be deleted (the next sync would add it back); one added by hand can', async () => {
    const synced = brand({ gyftrId: 1, slug: 'amazon-pay' });
    const handMade = brand({ slug: 'mine' });
    const { service, sync } = setup([synced, handMade], gyftr([], {}));
    await expect(service.delete(actor, synced.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(sync.resetToGyftr(actor, handMade.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it('a CSV row for a GyFTR brand counts as a hand edit', async () => {
    const amazon = brand({ gyftrId: 1, slug: 'amazon-pay', name: 'Amazon Pay', discountPercent: 1, category: '' });
    const { service } = setup([amazon], gyftr([], {}));
    const csv = 'name,slug,discountPercent,category,redemption\nAmazon Pay,amazon-pay,5,Shopping,ONLINE\n';
    expect(await service.importCsv(actor, Buffer.from(csv))).toMatchObject({ created: 0, updated: 1 });
    expect(amazon).toMatchObject({ discountPercent: 5, category: 'Shopping', manualFields: ['discountPercent'] });
  });

  it('follows GyFTR staging on a staging panel: brand API and brand pages', async () => {
    expect(STAGING).toMatchObject({ environment: 'staging', apiBase: 'https://gyftrapi.gyftr.net/gyftrapi/api/v1', source: 'gyftrapi.gyftr.net', brandPageBase: 'https://www.gvhelpdesk.net' });
    expect(PROD).toMatchObject({ environment: 'production', apiBase: 'https://api.gyftr.com/gyftrapi/api/v1', source: 'api.gyftr.com', brandPageBase: 'https://www.gyftr.com' });
    expect(gyftrTarget({ ADMIN_FRONTEND_ORIGIN: 'http://localhost:5173' }).environment).toBe('staging');
    expect(gyftrTarget({ ADMIN_FRONTEND_ORIGIN: 'https://occasion-admin.gyftr.com' }).environment).toBe('production');
    expect(gyftrTarget({ ADMIN_FRONTEND_ORIGIN: 'https://evil-gyftr.net' }).environment).toBe('production'); // only *.gyftr.net
    expect(STAGING.configuredBy).toBe('panel address');
    // GYFTR_API_URL / GYFTR_BRAND_PAGE_BASE_URL (.env, Secrets Manager) decide when set.
    expect(gyftrTarget({ ADMIN_FRONTEND_ORIGIN: 'https://occasion-admin.gyftr.net', GYFTR_API_URL: 'https://api.gyftr.com/gyftrapi/api/v1/', GYFTR_BRAND_PAGE_BASE_URL: 'https://www.gyftr.com/' }))
      .toEqual({ environment: 'production', apiBase: 'https://api.gyftr.com/gyftrapi/api/v1', source: 'api.gyftr.com', brandPageBase: 'https://www.gyftr.com', configuredBy: 'settings' });
    expect(gyftrTarget({ ADMIN_FRONTEND_ORIGIN: 'https://occasion-admin.gyftr.com', GYFTR_API_URL: 'https://gyftrapi.gyftr.net/gyftrapi/api/v1', GYFTR_BRAND_PAGE_BASE_URL: 'https://www.gvhelpdesk.net' }))
      .toMatchObject({ environment: 'staging', source: 'gyftrapi.gyftr.net', brandPageBase: 'https://www.gvhelpdesk.net' });
    // Only the API set: the site is that API's environment's.
    expect(gyftrTarget({ ADMIN_FRONTEND_ORIGIN: 'https://occasion-admin.gyftr.com', GYFTR_API_URL: 'https://gyftrapi.gyftr.net/gyftrapi/api/v1' }).brandPageBase).toBe('https://www.gvhelpdesk.net');
    // Any other API (e.g. a new host) with its own site.
    expect(gyftrTarget({ ADMIN_FRONTEND_ORIGIN: 'https://occasion-admin.gyftr.net', GYFTR_API_URL: 'https://brands.example.net/api/v1', GYFTR_BRAND_PAGE_BASE_URL: 'https://shop.example.net' }))
      .toMatchObject({ apiBase: 'https://brands.example.net/api/v1', source: 'brands.example.net', brandPageBase: 'https://shop.example.net' });
  });

  it('switching to staging matches brands by slug, never by the other API’s id, and links them to the staging site', async () => {
    // Synced from production before: in staging, id 95 is another brand and "aldo" has another id.
    const flipkart = brand({ gyftrId: 95, slug: 'flipkart', name: 'Flipkart', productUrl: 'https://www.gyftr.com/flipkart' });
    const aldo = brand({ gyftrId: 624, slug: 'aldo', name: 'ALDO', productUrl: 'https://www.gyftr.com/aldo', category: 'Fashion', manualFields: ['discountPercent'], discountPercent: 9 });
    const custom = brand({ gyftrId: 7, slug: 'croma', name: 'Croma', productUrl: 'https://www.gyftr.com/croma?utm=occasion' });
    // Switched on by hand while it came from production: still switched off, production brands never show on staging.
    const keptOn = brand({ gyftrId: 8, slug: 'tanishq', name: 'Tanishq', manualFields: ['isActive'] });
    const handMade = brand({ slug: 'my-own', name: 'My own brand', productUrl: 'https://example.com/mine' });
    const api = gyftr(
      [listed(95, 'bakingo-promo-code', 'Bakingo'), listed(266, 'aldo', 'ALDO'), listed(300, 'croma', 'Croma')],
      { 'bakingo-promo-code': detail('Bakingo', 4), aldo: detail('ALDO', 3), croma: detail('Croma', 2) },
      STAGING.apiBase,
    );
    const { repo, sync } = setup([flipkart, aldo, custom, handMade, keptOn], api, STAGING);
    expect(await sync.start(actor)).toMatchObject({ listed: 3, created: 1, updated: 2, deactivated: 2 });
    expect(keptOn.isActive).toBe(false);
    expect(api.calls.every((u) => u.startsWith('https://gyftrapi.gyftr.net/gyftrapi/api/v1/'))).toBe(true);

    // Flipkart is not turned into Bakingo: it is not in the staging list, so it is switched off (not deleted).
    expect(flipkart).toMatchObject({ name: 'Flipkart', slug: 'flipkart', isActive: false, gyftrSource: 'api.gyftr.com' });
    // Bakingo is a new brand, linking to the staging site.
    expect(repo.brands.find((b) => b.slug === 'bakingo-promo-code')).toMatchObject({ gyftrId: 95, gyftrSource: 'gyftrapi.gyftr.net', productUrl: 'https://www.gvhelpdesk.net/bakingo-promo-code' });
    // ALDO keeps its record (pages refer to it), now from staging: new id, staging link, hand-edited discount and category kept.
    expect(aldo).toMatchObject({ gyftrId: 266, gyftrSource: 'gyftrapi.gyftr.net', productUrl: 'https://www.gvhelpdesk.net/aldo', discountPercent: 9, category: 'Fashion', isActive: true });
    // A link typed by hand is kept.
    expect(custom).toMatchObject({ gyftrId: 300, gyftrSource: 'gyftrapi.gyftr.net', productUrl: 'https://www.gyftr.com/croma?utm=occasion' });
    // Brands added by hand are not GyFTR's to switch off.
    expect(handMade.isActive).toBe(true);

    // Brands from the other GyFTR are not in the panel at all; this one's cannot be deleted (the sync adds them back).
    const service = new BrandService(repo as unknown as IBrandRepository, { changed: () => {} } as never, new AuditService(noAudit, silentLogger), STAGING.brandPageBase, STAGING.source);
    await expect(service.get(flipkart.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.delete(actor, flipkart.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(sync.resetToGyftr(actor, flipkart.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.delete(actor, aldo.id)).rejects.toBeInstanceOf(ConflictError);
    expect((await service.get(aldo.id)).slug).toBe('aldo');
    expect((await service.get(handMade.id)).slug).toBe('my-own');
  });

  it('follows a slug GyFTR changes, with its link, unless another brand has that slug', async () => {
    const tanishq = brand({ gyftrId: 86, slug: 'tanishq', name: 'Tanishq', productUrl: 'https://www.gyftr.com/tanishq' });
    const bata = brand({ gyftrId: 87, slug: 'bata', name: 'Bata', productUrl: 'https://www.gyftr.com/bata' });
    const other = brand({ slug: 'bata-shoes', name: 'Bata shoes (by hand)' });
    const api = gyftr([listed(86, 'tanishq-jewellery', 'Tanishq'), listed(87, 'bata-shoes', 'Bata')], { 'tanishq-jewellery': detail('Tanishq', 1), 'bata-shoes': detail('Bata', 1) });
    const { sync } = setup([tanishq, bata, other], api);
    await sync.start(actor);
    expect(tanishq).toMatchObject({ slug: 'tanishq-jewellery', productUrl: 'https://www.gyftr.com/tanishq-jewellery' });
    expect(bata).toMatchObject({ slug: 'bata', productUrl: 'https://www.gyftr.com/bata' }); // "bata-shoes" belongs to another brand
  });

  it('switches off brands from another GyFTR brand API right away (at start-up), before any sync', async () => {
    const prodBrand = brand({ gyftrId: 1, slug: 'amazon', manualFields: ['isActive'] }); // given a production source by setup()
    const handMade = brand({ slug: 'mine' });
    const { sync, changed } = setup([prodBrand, handMade], gyftr([], {}), STAGING);
    expect(await sync.hideOtherSources()).toBe(1);
    expect(prodBrand.isActive).toBe(false);
    expect(handMade.isActive).toBe(true);
    expect(changed).toEqual(['brands']); // published pages are re-rendered without it
    expect(await sync.hideOtherSources()).toBe(0); // nothing left: no re-render
    expect(changed).toEqual(['brands']);
  });
});


