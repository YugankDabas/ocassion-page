import type { Server } from 'node:http';
import { Readable } from 'node:stream';
import type { PrismaClient } from '@prisma/client';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createContainer } from '../src/container';
import { createLogger } from '../src/lib/logger';
import { S3Storage } from '../src/storage/StorageProvider';

/**
 * Images in a bucket that may not be read publicly (staging: drafts-bucket, shared with another
 * portal): the panel uses its own folder only, and this API serves the images from it.
 */
const BUCKET = 'drafts-bucket';
const MEDIA = 'https://api-occasion-admin.gyftr.net/media';
const prisma = new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : () => { throw new Error('no database in these tests'); }) }) as unknown as PrismaClient;

/** The bucket: our folder holds one image and one non-image; another portal has a file outside it. */
const objects: Record<string, { body: string; type: string }> = {
  'occasion-pages/media/2026/10/banner.webp': { body: 'WEBP-BYTES', type: 'image/webp' },
  'occasion-pages/media/2026/10/notes.html': { body: '<script>alert(1)</script>', type: 'text/html' },
  'other-portal/private/contract.png': { body: 'SECRET', type: 'image/png' },
};
const calls: { command: string; key: string }[] = [];

function storageWithFakeBucket(storage: S3Storage) {
  const client = (storage as unknown as { client: { send: (command: unknown) => Promise<unknown> } }).client;
  vi.spyOn(client, 'send').mockImplementation(async (command: unknown) => {
    const { Key } = (command as { input: { Key: string } }).input;
    calls.push({ command: (command as object).constructor.name, key: Key });
    if (command instanceof GetObjectCommand) {
      const file = objects[Key];
      if (!file) throw Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' });
      return { Body: Readable.from([Buffer.from(file.body)]), ContentType: file.type, ContentLength: file.body.length, ETag: '"abc"' };
    }
    if (command instanceof PutObjectCommand || command instanceof DeleteObjectCommand) return {};
    throw new Error('unexpected command');
  });
  return storage;
}

let server: Server;
let base: string;
let storage: S3Storage;

beforeAll(async () => {
  const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/occasion_admin', JWT_SECRET: 'x'.repeat(48), PAGE_PUBLIC_BASE_URL: 'https://www.gyftr.com/occasion', S3_BUCKET: BUCKET, MEDIA_BASE_URL: MEDIA });
  const c = createContainer(env, createLogger('silent', false), prisma);
  if (!(c.storage instanceof S3Storage)) throw new Error('expected S3 storage');
  storage = storageWithFakeBucket(c.storage);
  server = createApp(c).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

describe('images in a bucket that is not public', () => {
  it("without any setting, an upload gets this API's own address: the bucket need not be public", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    const plain = storageWithFakeBucket(new S3Storage({ bucket: BUCKET, region: 'ap-south-1', prefix: 'occasion-pages' }));
    const { url } = await plain.put('media/2026/10/new.webp', Buffer.from('x'), 'image/webp', 'https://api-occasion-admin.gyftr.net');
    expect(url).toBe('https://api-occasion-admin.gyftr.net/media/occasion-pages/media/2026/10/new.webp');
    expect(calls).toEqual([{ command: 'PutObjectCommand', key: 'occasion-pages/media/2026/10/new.webp' }]);
  });

  it('an image that cannot be read back is removed again, and the error says what to fix', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 502 })));
    const plain = storageWithFakeBucket(new S3Storage({ bucket: BUCKET, region: 'ap-south-1', prefix: 'occasion-pages' }));
    await expect(plain.put('media/2026/10/new.webp', Buffer.from('x'), 'image/webp', 'https://api-occasion-admin.gyftr.net')).rejects.toThrow(
      's3:GetObject on drafts-bucket/occasion-pages/*',
    );
    expect(calls.map((c) => c.command)).toEqual(['PutObjectCommand', 'DeleteObjectCommand']);
  });

  it('with MEDIA_BASE_URL (e.g. CloudFront later), uploads get that address instead', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    const { url } = await storage.put('media/2026/10/new.webp', Buffer.from('x'), 'image/webp');
    expect(url).toBe(`${MEDIA}/occasion-pages/media/2026/10/new.webp`);
    expect(calls).toEqual([{ command: 'PutObjectCommand', key: 'occasion-pages/media/2026/10/new.webp' }]);
    expect(fetch).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'HEAD' })); // checked over its public address
  });

  it('serves an image of the folder to anyone, cacheable and embeddable on gyftr.com', async () => {
    const res = await fetch(`${base}/media/occasion-pages/media/2026/10/banner.webp`, { headers: { Origin: 'https://www.gyftr.com' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('WEBP-BYTES');
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect((await fetch(`${base}/media/occasion-pages/media/2026/10/banner.webp`, { method: 'HEAD' })).status).toBe(200);
  });

  it('never reads anything outside the folder: the other portal\'s files are not reachable', async () => {
    for (const path of [
      'other-portal/private/contract.png',
      'occasion-pages/../other-portal/private/contract.png',
      'occasion-pages%2F..%2Fother-portal%2Fprivate%2Fcontract.png',
      'occasion-pagesX/contract.png',
      'occasion-pages',
    ]) {
      const res = await fetch(`${base}/media/${path}`);
      expect(res.status, path).toBe(404);
    }
    expect(calls.filter((c) => !c.key.startsWith('occasion-pages/'))).toEqual([]); // S3 was never asked for them
  });

  it('serves images only, and says "not found" for a missing file', async () => {
    expect((await fetch(`${base}/media/occasion-pages/media/2026/10/notes.html`)).status).toBe(404);
    expect((await fetch(`${base}/media/occasion-pages/media/2026/10/missing.webp`)).status).toBe(404);
    expect((await fetch(`${base}/media/occasion-pages/media/2026/10/banner.webp`, { method: 'POST' })).status).toBe(404);
  });
});
