import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it } from 'vitest';
import { requireOwnPassword } from '../src/http/middleware';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../src/lib/errors';
import type { IUserRepository, UserRecord } from '../src/repositories/types';
import { AuditService } from '../src/services/AuditService';
import { AuthService } from '../src/services/AuthService';
import { UserService } from '../src/services/UserService';
import { SessionTokenService, type IPasswordHasher } from '../src/services/security';
import { noAudit, silentLogger } from './fakes';

/** Fast stand-in for bcrypt. */
const hasher: IPasswordHasher = { hash: async (p) => `hashed:${p}`, verify: async (p, h) => h === `hashed:${p}` };

class InMemoryUsers implements IUserRepository {
  rows: UserRecord[] = [];
  async findById(id: string) {
    return this.rows.find((u) => u.id === id) ?? null;
  }
  async findByEmail(email: string) {
    return this.rows.find((u) => u.email === email.toLowerCase()) ?? null;
  }
  async list() {
    return this.rows;
  }
  async create(data: Parameters<IUserRepository['create']>[0]) {
    const user: UserRecord = { id: randomUUID(), ...data, isActive: true, tokenVersion: 0, lastLoginAt: null, createdAt: new Date() };
    this.rows.push(user);
    return user;
  }
  async update(id: string, data: Parameters<IUserRepository['update']>[1]) {
    const user = this.rows.find((u) => u.id === id)!;
    const { bumpTokenVersion, ...rest } = data;
    Object.assign(user, rest, bumpTokenVersion ? { tokenVersion: user.tokenVersion + 1 } : {});
    return user;
  }
  async touchLogin() {}
  async countActiveAdmins() {
    return this.rows.filter((u) => u.role === 'ADMIN' && u.isActive).length;
  }
}

function setup() {
  const users = new InMemoryUsers();
  const audit = new AuditService(noAudit, silentLogger);
  const auth = new AuthService(users, hasher, new SessionTokenService('s'.repeat(40), 8), audit);
  const service = new UserService(users, hasher, audit);
  return { users, auth, service };
}

/** Runs the guard for a signed-in user and returns the error it raises, if any. */
function guard(user: { mustChangePassword: boolean }, path: string): unknown {
  let raised: unknown;
  requireOwnPassword({ user, path } as unknown as Request, {} as Response, ((err?: unknown) => {
    raised = err;
  }) as NextFunction);
  return raised;
}

describe('first sign-in with a given password', () => {
  let ctx: ReturnType<typeof setup>;
  let admin: UserRecord;
  beforeEach(async () => {
    ctx = setup();
    admin = await ctx.users.create({ email: 'first@gyftr.net', name: 'First', role: 'ADMIN', passwordHash: await hasher.hash('Gyftr@123'), mustChangePassword: true });
  });

  it('signs in with the default password but is flagged to change it', async () => {
    const { user, token } = await ctx.auth.login('first@gyftr.net', 'Gyftr@123', null);
    expect(user.mustChangePassword).toBe(true);
    expect((await ctx.auth.authenticate(token)).mustChangePassword).toBe(true);
  });

  it('lets a flagged account reach only the account endpoints', () => {
    const flagged = { mustChangePassword: true };
    for (const path of ['/auth/me', '/auth/logout', '/auth/logout-all', '/auth/change-password']) expect(guard(flagged, path)).toBeUndefined();
    for (const path of ['/pages', '/users', '/brands/import', '/media', '/settings/site', '/auth/change-password/x']) expect(guard(flagged, path)).toBeInstanceOf(ForbiddenError);
    expect(guard({ mustChangePassword: false }, '/pages')).toBeUndefined();
  });

  it('changing the password unlocks the account and ends every existing session', async () => {
    const { token } = await ctx.auth.login('first@gyftr.net', 'Gyftr@123', null);
    await expect(ctx.auth.changePassword(admin.id, 'wrong', 'a-new-password-123', null)).rejects.toBeInstanceOf(ValidationError);
    await expect(ctx.auth.changePassword(admin.id, 'Gyftr@123', 'Gyftr@123', null)).rejects.toThrow('must be different');

    await ctx.auth.changePassword(admin.id, 'Gyftr@123', 'a-new-password-123', null);
    await expect(ctx.auth.authenticate(token)).rejects.toBeInstanceOf(UnauthorizedError); // old session is dead
    await expect(ctx.auth.login('first@gyftr.net', 'Gyftr@123', null)).rejects.toBeInstanceOf(UnauthorizedError); // default password no longer works
    expect((await ctx.auth.login('first@gyftr.net', 'a-new-password-123', null)).user.mustChangePassword).toBe(false);
  });
});

describe('invite-only users', () => {
  it('an invited user must replace the temporary password; so must a user whose password an admin resets', async () => {
    const { users, auth, service } = setup();
    const admin = await users.create({ email: 'admin@gyftr.net', name: 'Admin', role: 'ADMIN', passwordHash: await hasher.hash('admin-password-123'), mustChangePassword: false });
    const actor = { id: admin.id, ip: null };

    const invited = await service.create(actor, { email: 'editor@gyftr.net', name: 'Editor', role: 'EDITOR', password: 'temporary-pass-123' });
    expect(invited.mustChangePassword).toBe(true);
    await auth.changePassword(invited.id, 'temporary-pass-123', 'my-own-password-123', null);
    expect((await users.findById(invited.id))!.mustChangePassword).toBe(false);

    expect((await service.update(actor, invited.id, { password: 'reset-by-admin-123' })).mustChangePassword).toBe(true);
    // An administrator setting their own password from the Users screen is not locked out.
    expect((await service.update(actor, admin.id, { password: 'admin-new-pass-123' })).mustChangePassword).toBe(false);
    // Editing other fields does not touch the flag.
    expect((await service.update(actor, invited.id, { name: 'Renamed' })).mustChangePassword).toBe(true);
  });
});
