import type { Role, SessionUser } from '../contracts';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors';
import type { IUserRepository, UserRecord } from '../repositories/types';
import type { Actor, AuditService } from './AuditService';
import type { IPasswordHasher } from './security';

export interface UserView extends SessionUser {
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const toView = ({ id, email, name, role, mustChangePassword, isActive, lastLoginAt, createdAt }: UserRecord): UserView => ({
  id, email, name, role, mustChangePassword, isActive, lastLoginAt, createdAt,
});

/** Users are invite-only: an administrator creates each account. There is no sign-up. */
export class UserService {
  constructor(
    private readonly users: IUserRepository,
    private readonly hasher: IPasswordHasher,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserView[]> {
    return (await this.users.list()).map(toView);
  }

  async create(actor: Actor, input: { email: string; name: string; role: Role; password: string }): Promise<UserView> {
    if (await this.users.findByEmail(input.email)) throw new ConflictError('A user with this email already exists');
    const user = await this.users.create({
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await this.hasher.hash(input.password),
      mustChangePassword: true, // the invited user chooses their own password at first sign-in
    });
    await this.audit.record(actor, { action: 'user.create', entityType: 'user', entityId: user.id, metadata: { role: user.role } });
    return toView(user);
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
      // A password set for someone else is temporary: they must replace it at their next sign-in.
      ...(input.password !== undefined ? { passwordHash: await this.hasher.hash(input.password), mustChangePassword: actor.id !== userId } : {}),
      bumpTokenVersion: securityChange,
    });
    await this.audit.record(actor, {
      action: 'user.update',
      entityType: 'user',
      entityId: userId,
      metadata: { fields: Object.keys(input).filter((k) => k !== 'password'), passwordReset: input.password !== undefined },
    });
    return toView(user);
  }
}
