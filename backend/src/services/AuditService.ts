import type { Logger } from '../lib/logger';
import type { AuditEntry, IAuditRepository } from '../repositories/types';

export interface Actor {
  id: string;
  ip?: string | null;
}

/** Records who did what. Audit failures are logged but never break the user action. */
export class AuditService {
  constructor(
    private readonly repo: IAuditRepository,
    private readonly logger: Logger,
  ) {}

  async record(actor: Actor | null, entry: Omit<AuditEntry, 'actorId' | 'ip'>): Promise<void> {
    try {
      await this.repo.record({ ...entry, actorId: actor?.id ?? null, ip: actor?.ip ?? null });
    } catch (err) {
      this.logger.error({ err, entry }, 'Failed to write audit log');
    }
  }

  list(opts: { page: number; pageSize: number; entityType?: string; entityId?: string }) {
    return this.repo.list(opts);
  }
}
