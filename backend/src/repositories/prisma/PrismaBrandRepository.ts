import type { Brand, Prisma, PrismaClient } from '@prisma/client';
import type { BrandInput } from '../../contracts';
import type { BrandQuery, BrandRecord, BrandSyncWrite, IBrandRepository, Paginated } from '../types';

function toRecord(b: Brand): BrandRecord {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    logoUrl: b.logoUrl,
    productUrl: b.productUrl,
    discountPercent: b.discountPercent === null ? null : Number(b.discountPercent),
    discountLabel: b.discountLabel,
    category: b.category,
    redemption: b.redemption,
    minDenomination: b.minDenomination,
    isActive: b.isActive,
    gyftrId: b.gyftrId,
    gyftrSource: b.gyftrSource,
    manualFields: b.manualFields,
    syncedAt: b.syncedAt,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

/** Brands added by hand or synced from this GyFTR brand API; those from another one are never listed. */
const fromSource = (source: string | undefined): Prisma.BrandWhereInput =>
  source ? { OR: [{ gyftrSource: null }, { gyftrSource: source }] } : {};

export class PrismaBrandRepository implements IBrandRepository {
  constructor(private readonly db: PrismaClient) {}

  async query(q: BrandQuery): Promise<Paginated<BrandRecord>> {
    const search = q.search?.trim();
    const where: Prisma.BrandWhereInput = {
      AND: [
        search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search, mode: 'insensitive' } }] } : {},
        fromSource(q.source),
      ],
      ...(q.category ? { category: q.category } : {}),
      ...(q.active === undefined ? {} : { isActive: q.active }),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.brand.findMany({ where, orderBy: { name: 'asc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.db.brand.count({ where }),
    ]);
    return { items: rows.map(toRecord), total, page: q.page, pageSize: q.pageSize };
  }

  async findById(id: string): Promise<BrandRecord | null> {
    const b = await this.db.brand.findUnique({ where: { id } });
    return b && toRecord(b);
  }

  async findBySlug(slug: string): Promise<BrandRecord | null> {
    const b = await this.db.brand.findUnique({ where: { slug } });
    return b && toRecord(b);
  }

  async findManyByIds(ids: string[], opts: { activeOnly?: boolean; source?: string } = {}): Promise<BrandRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.brand.findMany({
      where: { id: { in: ids }, ...(opts.activeOnly ? { isActive: true } : {}), ...fromSource(opts.source) },
    });
    return rows.map(toRecord);
  }

  async firstActive(limit: number, source?: string): Promise<BrandRecord[]> {
    const rows = await this.db.brand.findMany({
      where: { isActive: true, ...fromSource(source) },
      orderBy: [{ discountPercent: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
      take: limit,
    });
    return rows.map(toRecord);
  }

  async categories(source?: string): Promise<string[]> {
    const rows = await this.db.brand.findMany({
      where: { category: { not: '' }, ...fromSource(source) },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return rows.map((r) => r.category);
  }

  async create(data: BrandInput): Promise<BrandRecord> {
    return toRecord(await this.db.brand.create({ data }));
  }

  async update(id: string, data: BrandInput & { manualFields?: string[] }): Promise<BrandRecord> {
    return toRecord(await this.db.brand.update({ where: { id }, data }));
  }

  async upsertBySlug(data: BrandInput): Promise<{ record: BrandRecord; created: boolean }> {
    const existing = await this.db.brand.findUnique({ where: { slug: data.slug }, select: { id: true } });
    const row = existing
      ? await this.db.brand.update({ where: { id: existing.id }, data })
      : await this.db.brand.create({ data });
    return { record: toRecord(row), created: !existing };
  }

  async delete(id: string): Promise<void> {
    await this.db.brand.delete({ where: { id } });
  }

  async all(): Promise<BrandRecord[]> {
    return (await this.db.brand.findMany({ orderBy: { name: 'asc' } })).map(toRecord);
  }

  async saveSync({ creates, updates }: BrandSyncWrite): Promise<void> {
    const syncedAt = new Date();
    const writes = [
      ...(creates.length ? [this.db.brand.createMany({ data: creates.map((c) => ({ ...c, syncedAt })) })] : []),
      ...updates.map((u) => this.db.brand.update({ where: { id: u.id }, data: { ...u.data, syncedAt } })),
    ];
    if (writes.length) await this.db.$transaction(writes);
  }

  async setManualFields(id: string, fields: string[]): Promise<BrandRecord> {
    return toRecord(await this.db.brand.update({ where: { id }, data: { manualFields: fields } }));
  }

  async deactivateOtherSources(source: string): Promise<number> {
    const { count } = await this.db.brand.updateMany({
      where: { isActive: true, gyftrSource: { not: null }, NOT: { gyftrSource: source } },
      data: { isActive: false },
    });
    return count;
  }
}
