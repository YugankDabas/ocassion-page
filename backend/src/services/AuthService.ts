import type { SessionUser } from '../contracts';
import { UnauthorizedError, ValidationError } from '../lib/errors';
import type { IUserRepository, UserRecord } from '../repositories/types';
import type { AuditService } from './AuditService';
import type { IPasswordHasher, SessionTokenService } from './security';

export function toSessionUser(u: UserRecord): SessionUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

export class AuthService {
  /** Hash of a random string, compared against when the email is unknown so
   *  response timing does not reveal which accounts exist. */
  private dummyHash: Promise<string>;

  constructor(
    private readonly users: IUserRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: SessionTokenService,
    private readonly audit: AuditService,
  ) {
    this.dummyHash = hasher.hash(`dummy-${Math.random()}`);
  }

  async login(email: string, password: string, ip: string | null): Promise<{ user: SessionUser; token: string }> {
    const user = await this.users.findByEmail(email);
    const ok = await this.hasher.verify(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || !ok || !user.isActive) {
      await this.audit.record(user ? { id: user.id, ip } : null, {
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: user?.id ?? null,
        metadata: { email },
      });
      throw new UnauthorizedError('Invalid email or password');
    }
    await this.users.touchLogin(user.id);
    await this.audit.record({ id: user.id, ip }, { action: 'auth.login', entityType: 'user', entityId: user.id });
    const token = await this.tokens.sign(user.id, { ver: user.tokenVersion, role: user.role });
    return { user: toSessionUser(user), token };
  }

  /** Resolve a session token to a live user. Revoked / deactivated sessions are rejected. */
  async authenticate(token: string): Promise<SessionUser> {
    const claims = await this.tokens.verify(token);
    if (!claims) throw new UnauthorizedError('Session expired, please sign in again');
    const user = await this.users.findById(claims.sub);
    if (!user || !user.isActive || user.tokenVersion !== claims.ver) {
      throw new UnauthorizedError('Session expired, please sign in again');
    }
    return toSessionUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, ip: string | null): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError();
    if (!(await this.hasher.verify(currentPassword, user.passwordHash))) {
      throw new ValidationError('Current password is incorrect');
    }
    await this.users.update(userId, { passwordHash: await this.hasher.hash(newPassword), bumpTokenVersion: true });
    await this.audit.record({ id: userId, ip }, { action: 'auth.password_changed', entityType: 'user', entityId: userId });
  }

  /** Invalidate every session for this user (logout everywhere). */
  async revokeSessions(userId: string): Promise<void> {
    await this.users.update(userId, { bumpTokenVersion: true });
  }

  get sessionTtlSeconds(): number {
    return this.tokens.ttl;
  }
}
