import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { Role } from '../contracts';

/* ---------- Password hashing ---------- */
export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export class BcryptPasswordHasher implements IPasswordHasher {
  constructor(private readonly cost = 12) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.cost);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}

/* ---------- Signed tokens ---------- */
abstract class HmacJwt<TClaims extends Record<string, unknown>> {
  private readonly key: Uint8Array;

  protected constructor(
    secret: string,
    private readonly audience: string,
    private readonly ttlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  protected async signClaims(subject: string, claims: TClaims): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(subject)
      .setIssuer('gyftr-occasion-admin')
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + this.ttlSeconds)
      .sign(this.key);
  }

  /** Returns null for any invalid / expired / tampered token. */
  protected async verifyClaims(token: string): Promise<(TClaims & { sub: string }) | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: 'gyftr-occasion-admin',
        audience: this.audience,
      });
      if (typeof payload.sub !== 'string') return null;
      return payload as unknown as TClaims & { sub: string };
    } catch (err) {
      if (err instanceof joseErrors.JOSEError) return null;
      throw err;
    }
  }

  get ttl(): number {
    return this.ttlSeconds;
  }
}

export interface SessionClaims extends Record<string, unknown> {
  ver: number;
  role: Role;
}

export class SessionTokenService extends HmacJwt<SessionClaims> {
  constructor(secret: string, ttlHours: number) {
    super(secret, 'admin-session', ttlHours * 3600);
  }

  sign(userId: string, claims: SessionClaims): Promise<string> {
    return this.signClaims(userId, claims);
  }

  verify(token: string) {
    return this.verifyClaims(token);
  }
}
