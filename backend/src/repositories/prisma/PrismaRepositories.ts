import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  AuditEntry,
  AuditRecord,
  IAuditRepository,
  IMediaRepository,
  IOccasionRepository,
  ISettingsRepository,
  ITemplateRepository,
  IUserRepository,
  MediaRecord,
  OccasionRecord,
  Paginated,
  TemplateRecord,
  UserRecord,
} from '../types';

const json = (value: unknown) => value as Prisma.InputJsonValue;

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.db.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  list(): Promise<UserRecord[]> {
    return this.db.user.findMany({ orderBy: { createdAt: 'asc' } });
  }

  create(data: { email: string; name: string; role: UserRecord['role']; passwordHash: string }): Promise<UserRecord> {
    return this.db.user.create({ data: { ...data, email: data.email.toLowerCase() } });
  }

  update(
    id: string,
    data: Partial<Pick<UserRecord, 'name' | 'role' | 'isActive' | 'passwordHash'>> & { bumpTokenVersion?: boolean },
  ): Promise<UserRecord> {
    const { bumpTokenVersion, ...rest } = data;
    return this.db.user.update({
      where: { id },
      data: { ...rest, ...(bumpTokenVersion ? { tokenVersion: { increment: 1 } } : {}) },
    });
  }

  async touchLogin(id: string): Promise<void> {
    await this.db.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  countActiveAdmins(): Promise<number> {
    return this.db.user.count({ where: { role: 'ADMIN', isActive: true } });
  }
}

export class PrismaOccasionRepository implements IOccasionRepository {
  constructor(private readonly db: PrismaClient) {}

  list(): Promise<OccasionRecord[]> {
    return this.db.occasion.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  findById(id: string): Promise<OccasionRecord | null> {
    return this.db.occasion.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<OccasionRecord | null> {
    return this.db.occasion.findUnique({ where: { slug } });
  }

  create(data: Omit<OccasionRecord, 'id'>): Promise<OccasionRecord> {
    return this.db.occasion.create({ data: { ...data, theme: json(data.theme) } });
  }

  update(id: string, data: Partial<Omit<OccasionRecord, 'id'>>): Promise<OccasionRecord> {
    const { theme, ...rest } = data;
    return this.db.occasion.update({
      where: { id },
      data: { ...rest, ...(theme === undefined ? {} : { theme: json(theme) }) },
    });
  }
}

export class PrismaTemplateRepository implements ITemplateRepository {
  constructor(private readonly db: PrismaClient) {}

  list(occasionId?: string): Promise<TemplateRecord[]> {
    return this.db.template.findMany({
      where: occasionId ? { OR: [{ occasionId }, { occasionId: null }] } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<TemplateRecord | null> {
    return this.db.template.findUnique({ where: { id } });
  }

  create(data: Omit<TemplateRecord, 'id' | 'createdAt'> & { createdById: string }): Promise<TemplateRecord> {
    return this.db.template.create({ data: { ...data, content: json(data.content) } });
  }

  async delete(id: string): Promise<void> {
    await this.db.template.delete({ where: { id } });
  }
}

export class PrismaMediaRepository implements IMediaRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(opts: { page: number; pageSize: number; search?: string }): Promise<Paginated<MediaRecord>> {
    const search = opts.search?.trim();
    const where: Prisma.MediaWhereInput = search
      ? { OR: [{ originalName: { contains: search, mode: 'insensitive' } }, { alt: { contains: search, mode: 'insensitive' } }] }
      : {};
    const [items, total] = await this.db.$transaction([
      this.db.media.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize }),
      this.db.media.count({ where }),
    ]);
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  findById(id: string): Promise<MediaRecord | null> {
    return this.db.media.findUnique({ where: { id } });
  }

  create(data: Omit<MediaRecord, 'id' | 'createdAt'> & { uploadedById: string }): Promise<MediaRecord> {
    return this.db.media.create({ data });
  }

  updateAlt(id: string, alt: string): Promise<MediaRecord> {
    return this.db.media.update({ where: { id }, data: { alt } });
  }

  async delete(id: string): Promise<void> {
    await this.db.media.delete({ where: { id } });
  }
}

export class PrismaSettingsRepository implements ISettingsRepository {
  constructor(private readonly db: PrismaClient) {}

  async get(key: string): Promise<unknown | null> {
    const row = await this.db.siteSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db.siteSetting.upsert({ where: { key }, create: { key, value: json(value) }, update: { value: json(value) } });
  }
}

export class PrismaAuditRepository implements IAuditRepository {
  constructor(private readonly db: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.db.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ? json(entry.metadata) : undefined,
        ip: entry.ip ?? null,
      },
    });
  }

  async list(opts: { page: number; pageSize: number; entityType?: string; entityId?: string }): Promise<Paginated<AuditRecord>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(opts.entityType ? { entityType: opts.entityType } : {}),
      ...(opts.entityId ? { entityId: opts.entityId } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: { actor: { select: { name: true, email: true } } },
      }),
      this.db.auditLog.count({ where }),
    ]);
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }
}
