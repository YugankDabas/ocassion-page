import type { Server } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createContainer } from '../src/container';
import { loadEnv } from '../src/config/env';
import { createLogger } from '../src/lib/logger';
import { databaseFailureReason, newStartupReport } from '../src/startup';

const frontendOrigin = 'https://occasion-admin.gyftr.net';
// No database here: these tests are about origins only, and say so if a request ever reaches for one.
const prisma = new Proxy({}, {
  get(_target, property) {
    if (property === 'then') return undefined;
    throw new Error(`The CORS tests must not touch the database (prisma.${String(property)})`);
  },
}) as unknown as PrismaClient;
let baseUrl: string;
let server: Server | undefined;

beforeAll(async () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://localhost/occasion_admin',
    JWT_SECRET: 'x'.repeat(48),
    PAGE_PUBLIC_BASE_URL: 'https://www.gyftr.com/occasion',
    PUBLIC_UPLOADS_BASE_URL: 'http://localhost:4545/uploads',
    ADMIN_FRONTEND_ORIGIN: frontendOrigin,
  });
  const app = createApp(createContainer(env, createLogger('silent', false), prisma));
  const runningServer = app.listen(0, '127.0.0.1');
  server = runningServer;
  await new Promise<void>((resolve, reject) => {
    runningServer.once('listening', resolve);
    runningServer.once('error', reject);
  });
  const address = runningServer.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  const runningServer = server;
  if (runningServer) await new Promise<void>((resolve, reject) => runningServer.close((err) => (err ? reject(err) : resolve())));
});

describe('while the database is being prepared', () => {
  it('answers the health check and tells the panel it is starting, with CORS headers', async () => {
    const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/occasion_admin', JWT_SECRET: 'x'.repeat(48), PAGE_PUBLIC_BASE_URL: 'https://www.gyftr.com/occasion', PUBLIC_UPLOADS_BASE_URL: 'http://localhost:4545/uploads', ADMIN_FRONTEND_ORIGIN: frontendOrigin });
    const startup = newStartupReport();
    const starting = createApp(createContainer(env, createLogger('silent', false), prisma), startup).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => starting.once('listening', resolve));
    const address = starting.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const url = `http://127.0.0.1:${address.port}`;
    try {
      const health = await fetch(`${url}/healthz`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: 'ok', database: 'starting', errors: [] });

      const login = await fetch(`${url}/api/v1/auth/login`, { method: 'POST', headers: { Origin: frontendOrigin, 'content-type': 'application/json' }, body: '{}' });
      expect(login.status).toBe(503);
      expect(login.headers.get('access-control-allow-origin')).toBe(frontendOrigin); // the browser can read the reply
      expect(((await login.json()) as { error: { code: string } }).error.code).toBe('STARTING');

      startup.databaseError = 'connection refused';
      expect(await (await fetch(`${url}/healthz`)).json()).toMatchObject({ status: 'ok', database: 'unavailable', reason: 'other', errors: ['Database: connection refused'] });
      startup.ready = true;
      expect((await fetch(`${url}/api/v1/auth/me`, { headers: { Origin: frontendOrigin } })).status).toBe(401); // the API itself answers now
    } finally {
      await new Promise<void>((resolve) => starting.close(() => resolve()));
    }
  });
});

describe('reason shown by the health check', () => {
  it('is a category and Prisma code only, never the message', () => {
    const secretish = 'Database migration failed: Error: P1001: Can\'t reach database server at `prod-db.abc.ap-south-1.rds.amazonaws.com:5432` for user admin_user';
    expect(databaseFailureReason(secretish)).toBe('cannot_reach_database_server (P1001)');
    expect(databaseFailureReason('P1000: Authentication failed against database server, the provided database credentials for `u` are not valid')).toBe('wrong_user_or_password (P1000)');
    expect(databaseFailureReason('Error: P1011: Error opening a TLS connection: self-signed certificate in certificate chain')).toBe('tls_error (P1011)');
    expect(databaseFailureReason('ERROR: permission denied for schema public')).toBe('permission_denied');
    expect(databaseFailureReason('P1003: Database `occasion-admin` does not exist')).toBe('database_does_not_exist (P1003)');
    expect(databaseFailureReason('Error loading shared library libssl.so.3: No such file or directory')).toBe('migration_tool_cannot_run');
    expect(databaseFailureReason('something unexpected with password=hunter2')).toBe('other');
    expect(databaseFailureReason('Database migration failed: Error: ERROR: permission denied to create database')).toBe('permission_denied');
    expect(databaseFailureReason('Error: P3009 migrate found failed migrations in the target database')).toBe('migration_failed (P3009)');
    expect(databaseFailureReason('Database settings still contain a template placeholder instead of a real value: DB_USER, DB_PASSWORD')).toBe('placeholder_value_in DB_USER, DB_PASSWORD');
  });
});

describe('admin API CORS', () => {
  it('allows credentialed preflight requests from the configured frontend origin', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'OPTIONS',
      headers: {
        Origin: frontendOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-csrf-token',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(frontendOrigin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('rejects requests from any other browser origin', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Origin: 'https://other.gyftr.net' },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('accepts the API\'s own origin and requests without an Origin header', async () => {
    const own = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { Origin: baseUrl } });
    expect(own.status).toBe(401); // reached the API: not signed in, but not refused as a foreign origin
    expect((await fetch(`${baseUrl}/api/v1/auth/me`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/healthz`, { headers: { Origin: 'https://other.gyftr.net' } })).status).toBe(200);
  });

  it('sets CORS headers on API responses from the configured origin', async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Origin: frontendOrigin },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('access-control-allow-origin')).toBe(frontendOrigin);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });
});
