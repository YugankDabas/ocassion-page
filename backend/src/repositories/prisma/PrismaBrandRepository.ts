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
    manualFields: b.manualFields,
    syncedAt: b.syncedAt,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

export class PrismaBrandRepository implements IBrandRepository {
  constructor(private readonly db: PrismaClient) {}

  async query(q: BrandQuery): Promise<Paginated<BrandRecord>> {
    const search = q.search?.trim();
    const where: Prisma.BrandWhereInput = {
      ...(search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search, mode: 'insensitive' } }] }
        : {}),
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

  async findManyByIds(ids: string[], opts: { activeOnly?: boolean } = {}): Promise<BrandRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.brand.findMany({
      where: { id: { in: ids }, ...(opts.activeOnly ? { isActive: true } : {}) },
    });
    return rows.map(toRecord);
  }

  async firstActive(limit: number): Promise<BrandRecord[]> {
    const rows = await this.db.brand.findMany({
      where: { isActive: true },
      orderBy: [{ discountPercent: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }],
      take: limit,
    });
    return rows.map(toRecord);
  }

  async categories(): Promise<string[]> {
    const rows = await this.db.brand.findMany({
      where: { category: { not: '' } },
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
}
