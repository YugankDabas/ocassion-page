import { isDeepStrictEqual } from 'node:util';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { PageSeo } from '../../render/seo';
import type { IPublicationRepository, PublicationRecord, RefreshOutcome, RenderedPublication } from '../types';

export class PrismaPublicationRepository implements IPublicationRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByPageId(pageId: string): Promise<PublicationRecord | null> {
    const row = await this.db.pagePublication.findUnique({ where: { pageId } });
    return row ? { ...row, seo: row.seo as unknown as PageSeo } : null;
  }

  async refresh(pageId: string, version: number, render: () => Promise<RenderedPublication>): Promise<RefreshOutcome> {
    return this.db.$transaction(
      async (tx) => {
        // One refresh per page at a time, across every container; released when the transaction ends.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`occasion-publication:${pageId}`}))`;
        const row = await tx.pagePublication.findUnique({ where: { pageId } });
        if (!row || row.version !== version) return 'gone';

        const next = await render();
        const seo = JSON.parse(JSON.stringify(next.seo)) as Prisma.InputJsonValue;
        if (next.html === row.html && isDeepStrictEqual(seo, row.seo)) return 'unchanged';

        // Conditional on the version: a publish that committed while we rendered wins.
        const { count } = await tx.pagePublication.updateMany({ where: { pageId, version }, data: { html: next.html, seo, renderedAt: new Date() } });
        return count ? 'updated' : 'gone';
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  }
}
