import { Prisma, type PrismaClient } from '@prisma/client';
import type { PageStatus } from '../../contracts';
import type { IPageRepository, NewRevision, PageListItem, PageRecord, RenderedPublication, RevisionRecord } from '../types';

const json = (value: unknown) => value as Prisma.InputJsonValue;

export class PrismaPageRepository implements IPageRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<PageRecord | null> {
    return this.db.page.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<PageRecord | null> {
    return this.db.page.findUnique({ where: { slug } });
  }

  findByPublishedSlug(slug: string): Promise<PageRecord | null> {
    return this.db.page.findFirst({ where: { publishedSlug: slug, status: 'PUBLISHED' } });
  }

  async list(filter: { status?: PageStatus; occasionId?: string; search?: string }): Promise<PageListItem[]> {
    const search = filter.search?.trim();
    return this.db.page.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : { status: { not: 'ARCHIVED' } }),
        ...(filter.occasionId ? { occasionId: filter.occasionId } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        draftVersion: true,
        publishedVersion: true,
        publishedSlug: true,
        publishedAt: true,
        updatedAt: true,
        occasion: { select: { id: true, name: true, slug: true } },
        updatedBy: { select: { name: true } },
      },
    });
  }

  listPublished(): Promise<PageRecord[]> {
    return this.db.page.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' } });
  }

  create(
    data: { slug: string; title: string; occasionId: string; draft: unknown; createdById: string },
    revision: Omit<NewRevision, 'pageId'>,
  ): Promise<PageRecord> {
    return this.db.page.create({
      data: {
        slug: data.slug,
        title: data.title,
        occasionId: data.occasionId,
        draft: json(data.draft),
        createdById: data.createdById,
        updatedById: data.createdById,
        revisions: {
          create: { ...revision, content: json(revision.content) },
        },
      },
    });
  }

  async saveDraft(
    id: string,
    expectedVersion: number,
    data: { title: string; slug: string; draft: unknown; updatedById: string },
    revision: Omit<NewRevision, 'pageId' | 'version'>,
  ): Promise<PageRecord | null> {
    return this.db.$transaction(async (tx) => {
      const { count } = await tx.page.updateMany({
        where: { id, draftVersion: expectedVersion },
        data: {
          title: data.title,
          slug: data.slug,
          draft: json(data.draft),
          updatedById: data.updatedById,
          draftVersion: { increment: 1 },
        },
      });
      if (count === 0) return null;
      const page = await tx.page.findUniqueOrThrow({ where: { id } });
      await tx.pageRevision.create({
        data: { ...revision, content: json(revision.content), pageId: id, version: page.draftVersion },
      });
      return page;
    });
  }

  async publish(
    id: string,
    expectedVersion: number,
    data: { published: unknown; publishedSlug: string; publishedById: string },
    revision: Omit<NewRevision, 'pageId' | 'version'>,
    rendered: RenderedPublication,
  ): Promise<PageRecord | null> {
    return this.db.$transaction(async (tx) => {
      const publishedAt = new Date();
      const { count } = await tx.page.updateMany({
        where: { id, draftVersion: expectedVersion },
        data: {
          status: 'PUBLISHED',
          published: json(data.published),
          publishedVersion: expectedVersion,
          publishedSlug: data.publishedSlug,
          publishedById: data.publishedById,
          publishedAt,
        },
      });
      if (count === 0) return null;
      await tx.pageRevision.create({
        data: { ...revision, content: json(revision.content), pageId: id, version: expectedVersion },
      });
      // What gyftr.com reads. A page has at most one row; a new slug replaces the old one.
      await tx.pagePublication.deleteMany({ where: { pageId: id } });
      await tx.pagePublication.create({
        data: { slug: data.publishedSlug, pageId: id, version: expectedVersion, html: rendered.html, seo: json(rendered.seo), publishedAt, renderedAt: publishedAt },
      });
      return tx.page.findUniqueOrThrow({ where: { id } });
    });
  }

  async setStatus(id: string, status: PageStatus, opts: { clearPublished?: boolean } = {}): Promise<PageRecord> {
    if (!opts.clearPublished) return this.db.page.update({ where: { id }, data: { status } });
    // Taking a page down: the status and the row gyftr.com reads change together.
    const [, page] = await this.db.$transaction([
      this.db.pagePublication.deleteMany({ where: { pageId: id } }),
      this.db.page.update({
        where: { id },
        data: { status, published: Prisma.DbNull, publishedSlug: null, publishedVersion: null, publishedAt: null },
      }),
    ]);
    return page;
  }

  async delete(id: string): Promise<void> {
    await this.db.page.delete({ where: { id } });
  }

  listRevisions(pageId: string, limit: number): Promise<RevisionRecord[]> {
    return this.db.pageRevision.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { createdBy: { select: { name: true } } },
    });
  }

  findRevision(pageId: string, revisionId: string): Promise<RevisionRecord | null> {
    return this.db.pageRevision.findFirst({
      where: { id: revisionId, pageId },
      include: { createdBy: { select: { name: true } } },
    });
  }

  /** Keep the newest `keep` saves / restores; published versions are never pruned. */
  async pruneRevisions(pageId: string, keep: number): Promise<void> {
    const stale = await this.db.pageRevision.findMany({
      where: { pageId, kind: { not: 'PUBLISH' } },
      orderBy: { createdAt: 'desc' },
      skip: keep,
      select: { id: true },
    });
    if (stale.length) await this.db.pageRevision.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  }
}
