import type { Role, SessionUser } from '../contracts';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors';
import type { IUserRepository } from '../repositories/types';
import type { Actor, AuditService } from './AuditService';
import type { IPasswordHasher } from './security';

export interface UserView extends SessionUser {
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export class UserService {
  constructor(
    private readonly users: IUserRepository,
    private readonly hasher: IPasswordHasher,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserView[]> {
    const rows = await this.users.list();
    return rows.map(({ id, email, name, role, isActive, lastLoginAt, createdAt }) => ({
      id, email, name, role, isActive, lastLoginAt, createdAt,
    }));
  }

  async create(actor: Actor, input: { email: string; name: string; role: Role; password: string }): Promise<UserView> {
    if (await this.users.findByEmail(input.email)) throw new ConflictError('A user with this email already exists');
    const user = await this.users.create({
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await this.hasher.hash(input.password),
    });
    await this.audit.record(actor, { action: 'user.create', entityType: 'user', entityId: user.id, metadata: { role: user.role } });
    const { id, email, name, role, isActive, lastLoginAt, createdAt } = user;
    return { id, email, name, role, isActive, lastLoginAt, createdAt };
  }

  async update(
    actor: Actor,
    userId: string,
    input: { name?: string; role?: Role; isActive?: boolean; password?: string },
  ): Promise<UserView> {
    const existing = await this.users.findById(userId);
    if (!existing) throw new NotFoundError('User');

    const losesAdmin =
      existing.role === 'ADMIN' && existing.isActive && ((input.role && input.role !== 'ADMIN') || input.isActive === false);
    if (losesAdmin && (await this.users.countActiveAdmins()) <= 1) {
      throw new BadRequestError('At least one active admin is required');
    }
    if (actor.id === userId && input.isActive === false) throw new BadRequestError('You cannot deactivate yourself');

    const securityChange = input.password !== undefined || input.role !== undefined || input.isActive === false;
    const user = await this.users.update(userId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.password !== undefined ? { passwordHash: await this.hasher.hash(input.password) } : {}),
      bumpTokenVersion: securityChange,
    });
    await this.audit.record(actor, {
      action: 'user.update',
      entityType: 'user',
      entityId: userId,
      metadata: { fields: Object.keys(input).filter((k) => k !== 'password'), passwordReset: input.password !== undefined },
    });
    const { id, email, name, role, isActive, lastLoginAt, createdAt } = user;
    return { id, email, name, role, isActive, lastLoginAt, createdAt };
  }
}
