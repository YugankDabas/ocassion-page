import { parse } from 'csv-parse/sync';
import { brandInputSchema, slugSchema, type BrandInput } from '../contracts';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { SYNCED_BRAND_FIELDS, type BrandQuery, type BrandRecord, type IBrandRepository } from '../repositories/types';
import type { Actor, AuditService } from './AuditService';
import type { IContentChangeNotifier } from './ContentChanges';

export interface CsvImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

const MAX_IMPORT_ROWS = 2000;

/**
 * The brand library that pages pick from. Brand data is resolved at read time,
 * so changing a discount here updates every live page after revalidation.
 */
export class BrandService {
  constructor(
    private readonly brands: IBrandRepository,
    private readonly changes: IContentChangeNotifier,
    private readonly audit: AuditService,
    /** The GyFTR site brand cards link to (its page for the slug), e.g. https://www.gyftr.com. */
    private readonly productUrlBase = 'https://www.gyftr.com',
    /** The GyFTR brand API the sync follows (its host): brands from it are added back by every sync. */
    private readonly gyftrSource = 'api.gyftr.com',
  ) {}

  // The panel only ever sees brands added by hand or from the GyFTR brand API this panel follows.
  query(q: BrandQuery) {
    return this.brands.query({ ...q, source: this.gyftrSource });
  }

  categories() {
    return this.brands.categories(this.gyftrSource);
  }

  async get(id: string) {
    const brand = await this.brands.findById(id);
    if (!brand || (brand.gyftrSource !== null && brand.gyftrSource !== this.gyftrSource)) throw new NotFoundError('Brand');
    return brand;
  }

  findMany(ids: string[]) {
    return this.brands.findManyByIds(ids, { source: this.gyftrSource });
  }

  async create(actor: Actor, input: BrandInput) {
    if (await this.brands.findBySlug(input.slug)) throw new ConflictError(`Brand slug "${input.slug}" already exists`);
    const brand = await this.brands.create(this.withDefaults(input));
    await this.afterChange(actor, 'brand.create', brand.id, { slug: brand.slug });
    return brand;
  }

  /**
   * For a brand that comes from GyFTR: its slug stays GyFTR's (the sync looks the brand up by it),
   * and every synced field changed here is remembered, so the sync no longer overwrites it.
   */
  async update(actor: Actor, id: string, input: BrandInput) {
    const before = await this.get(id);
    if (before.gyftrId === null && !slugSchema.safeParse(input.slug).success) throw new ValidationError('Slug: lowercase letters, numbers and hyphens only');
    const data = before.gyftrId === null ? input : { ...input, slug: before.slug };
    const clash = await this.brands.findBySlug(data.slug);
    if (clash && clash.id !== id) throw new ConflictError(`Brand slug "${data.slug}" already exists`);
    const manualFields = before.gyftrId === null ? before.manualFields : [...new Set([...before.manualFields, ...changedSyncedFields(before, data, this.productUrlBase)])];
    const brand = await this.brands.update(id, { ...this.withDefaults(data), manualFields });
    await this.afterChange(actor, 'brand.update', id, { slug: brand.slug, ...(manualFields.length ? { manualFields } : {}) });
    return brand;
  }

  async delete(actor: Actor, id: string) {
    const brand = await this.get(id);
    if (brand.gyftrId !== null && brand.gyftrSource === this.gyftrSource) {
      throw new ConflictError('This brand comes from GyFTR and would be added again by the next sync. Edit it and switch it to inactive instead.');
    }
    await this.brands.delete(id);
    await this.afterChange(actor, 'brand.delete', id, { slug: brand.slug });
  }

  /**
   * Bulk upsert from CSV with header row:
   * name,slug,logoUrl,productUrl,discountPercent,discountLabel,category,redemption,minDenomination,isActive
   */
  async importCsv(actor: Actor, csv: Buffer): Promise<CsvImportResult> {
    let rows: Record<string, string>[];
    try {
      rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true, to: MAX_IMPORT_ROWS + 1 });
    } catch (err) {
      throw new ValidationError(`Could not read CSV: ${(err as Error).message}`);
    }
    if (rows.length > MAX_IMPORT_ROWS) throw new ValidationError(`CSV may contain at most ${MAX_IMPORT_ROWS} rows`);

    const result: CsvImportResult = { created: 0, updated: 0, errors: [] };
    for (const [index, row] of rows.entries()) {
      const slug = row.slug?.toLowerCase() ?? '';
      const parsed = brandInputSchema.safeParse({
        name: row.name,
        slug,
        logoUrl: row.logoUrl ?? '',
        productUrl: row.productUrl || `${this.productUrlBase}/${slug}`,
        discountPercent: row.discountPercent ? Number(row.discountPercent) : null,
        discountLabel: row.discountLabel ?? '',
        category: row.category ?? '',
        redemption: (row.redemption || 'BOTH').toUpperCase(),
        minDenomination: row.minDenomination ? Number(row.minDenomination) : null,
        isActive: row.isActive ? !['false', '0', 'no'].includes(row.isActive.toLowerCase()) : true,
      });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        result.errors.push({ row: index + 2, message: `${issue?.path.join('.')}: ${issue?.message}` });
        continue;
      }
      const existing = await this.brands.findBySlug(parsed.data.slug);
      if (existing && existing.gyftrId !== null) {
        // A GyFTR brand: the fields the CSV changes count as edited by hand, as in the edit form.
        const manualFields = [...new Set([...existing.manualFields, ...changedSyncedFields(existing, parsed.data, this.productUrlBase)])];
        await this.brands.update(existing.id, { ...this.withDefaults(parsed.data), manualFields });
        result.updated++;
        continue;
      }
      const { created } = await this.brands.upsertBySlug(this.withDefaults(parsed.data));
      if (created) result.created++;
      else result.updated++;
    }
    await this.afterChange(actor, 'brand.import', null, { created: result.created, updated: result.updated, errors: result.errors.length });
    return result;
  }

  private withDefaults<T extends BrandInput>(input: T): T {
    return { ...input, productUrl: input.productUrl || `${this.productUrlBase}/${input.slug}` };
  }

  private async afterChange(actor: Actor, action: string, entityId: string | null, metadata: Record<string, unknown>) {
    this.changes.changed('brands'); // published pages are re-rendered with the new brand data
    await this.audit.record(actor, { action, entityType: 'brand', entityId, metadata });
  }
}

/** The GyFTR-synced fields an editor changed. */
function changedSyncedFields(before: BrandRecord, after: BrandInput, brandPageBase: string): string[] {
  // The panel's own link for the slug (what an empty link becomes) is not a hand edit: the sync keeps it up to date.
  return SYNCED_BRAND_FIELDS.filter((field) => before[field] !== after[field] && !(field === 'productUrl' && after.productUrl === `${brandPageBase}/${after.slug}`));
}
