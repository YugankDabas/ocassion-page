import { parse } from 'csv-parse/sync';
import { brandInputSchema, type BrandInput } from '../contracts';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import type { BrandQuery, IBrandRepository } from '../repositories/types';
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
    private readonly productUrlBase = 'https://www.gyftr.com',
  ) {}

  query(q: BrandQuery) {
    return this.brands.query(q);
  }

  categories() {
    return this.brands.categories();
  }

  async get(id: string) {
    const brand = await this.brands.findById(id);
    if (!brand) throw new NotFoundError('Brand');
    return brand;
  }

  findMany(ids: string[]) {
    return this.brands.findManyByIds(ids);
  }

  async create(actor: Actor, input: BrandInput) {
    if (await this.brands.findBySlug(input.slug)) throw new ConflictError(`Brand slug "${input.slug}" already exists`);
    const brand = await this.brands.create(this.withDefaults(input));
    await this.afterChange(actor, 'brand.create', brand.id, { slug: brand.slug });
    return brand;
  }

  async update(actor: Actor, id: string, input: BrandInput) {
    await this.get(id);
    const clash = await this.brands.findBySlug(input.slug);
    if (clash && clash.id !== id) throw new ConflictError(`Brand slug "${input.slug}" already exists`);
    const brand = await this.brands.update(id, this.withDefaults(input));
    await this.afterChange(actor, 'brand.update', id, { slug: brand.slug });
    return brand;
  }

  async delete(actor: Actor, id: string) {
    const brand = await this.get(id);
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
      const { created } = await this.brands.upsertBySlug(this.withDefaults(parsed.data));
      if (created) result.created++;
      else result.updated++;
    }
    await this.afterChange(actor, 'brand.import', null, { created: result.created, updated: result.updated, errors: result.errors.length });
    return result;
  }

  private withDefaults(input: BrandInput): BrandInput {
    return { ...input, productUrl: input.productUrl || `${this.productUrlBase}/${input.slug}` };
  }

  private async afterChange(actor: Actor, action: string, entityId: string | null, metadata: Record<string, unknown>) {
    this.changes.changed('brands'); // published pages are re-rendered with the new brand data
    await this.audit.record(actor, { action, entityType: 'brand', entityId, metadata });
  }
}
