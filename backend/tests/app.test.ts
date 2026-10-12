import type { Server } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createContainer } from '../src/container';
import { loadEnv } from '../src/config/env';
import { createLogger } from '../src/lib/logger';

const frontendOrigin = 'https://occasion-admin.gyftr.net';
const prisma = new PrismaClient();
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
  await prisma.$disconnect();
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
