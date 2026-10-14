import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ServiceUnavailableError } from '../lib/errors';

/** Where uploaded files live: S3 when S3_BUCKET is set, local disk otherwise. Callers do not know which. */
export interface IStorageProvider {
  /** Every stored file's URL starts with this. */
  readonly publicBaseUrl: string;
  /** `apiOrigin`: this API's own address (from the upload request), for storage served by this API. */
  put(key: string, body: Buffer, contentType: string, apiOrigin?: string): Promise<{ url: string }>;
  delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]*$/;

function assertSafeKey(key: string): void {
  if (!KEY_PATTERN.test(key) || key.includes('..')) throw new Error(`Unsafe storage key: ${key}`);
}

/** Local disk — for development or single-node deployments with a persistent volume. */
export class LocalDiskStorage implements IStorageProvider {
  private readonly root: string;

  readonly publicBaseUrl: string;

  constructor(rootDir: string, publicBaseUrl: string) {
    this.root = path.resolve(rootDir);
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
  }

  get directory(): string {
    return this.root;
  }

  async put(key: string, body: Buffer): Promise<{ url: string }> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, { flag: 'wx' });
    return { url: `${this.publicBaseUrl}/${key}` };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const file = path.resolve(this.root, key);
    if (!file.startsWith(this.root + path.sep)) throw new Error('Storage key escapes upload directory');
    return file;
  }
}

/**
 * An S3 bucket, used only under its own folder (`prefix`): nothing outside that folder is ever
 * written, read or deleted, so the bucket can be shared with other applications.
 *
 * Files are served by this API's /media route (see open()), so the bucket does not have to be
 * public: an image's address is the API's own address (taken from the upload request) + /media/...
 * With `publicBaseUrl` (MEDIA_BASE_URL) they are served from that address instead, for example a
 * CloudFront distribution in front of the bucket.
 * Uses the default AWS credential chain (the ECS task role); no access keys are stored.
 */
export class S3Storage implements IStorageProvider {
  private readonly client: S3Client;
  readonly publicBaseUrl: string;
  /** Set once an uploaded file has been fetched back over its public address. */
  private publicReadConfirmed = false;

  constructor(private readonly opts: { bucket: string; region: string; prefix: string; publicBaseUrl?: string }) {
    this.client = new S3Client({ region: opts.region });
    this.publicBaseUrl = (opts.publicBaseUrl || `https://${opts.bucket}.s3.${opts.region}.amazonaws.com`).replace(/\/+$/, '');
  }

  /** Where a stored file is served from: MEDIA_BASE_URL when set, otherwise this API's /media route. */
  private baseUrl(apiOrigin?: string): string {
    if (this.opts.publicBaseUrl || !apiOrigin) return this.publicBaseUrl;
    return `${apiOrigin.replace(/\/+$/, '')}/media`;
  }

  /**
   * Reads one image of the folder, for this API's /media route. `objectKey` is the path after the
   * base address, e.g. "occasion-pages/media/2026/10/<id>.webp". Anything outside the folder, or a
   * file that is not an image, is "not found". Null when there is no such file.
   */
  async open(objectKey: string): Promise<{ body: Readable; contentType: string; contentLength?: number; etag?: string } | null> {
    const folder = `${this.folder()}/`;
    if (!objectKey.startsWith(folder) || !KEY_PATTERN.test(objectKey.slice(folder.length)) || objectKey.includes('..')) return null;
    try {
      const file = await this.client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: objectKey }));
      if (!(file.Body instanceof Readable)) return null;
      if (!file.ContentType?.startsWith('image/')) {
        file.Body.destroy();
        return null;
      }
      return { body: file.Body, contentType: file.ContentType, contentLength: file.ContentLength, etag: file.ETag };
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async put(key: string, body: Buffer, contentType: string, apiOrigin?: string): Promise<{ url: string }> {
    assertSafeKey(key);
    const objectKey = this.objectKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.opts.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        // Keys are content-unique (uuid), so they can be cached forever.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    const url = `${this.baseUrl(apiOrigin)}/${objectKey}`;
    await this.confirmPublicRead(key, url);
    return { url };
  }

  /**
   * Pages on gyftr.com load images straight from the bucket, so a stored file must be readable by
   * anyone at its address. Checked until it has worked once: a private bucket (Block Public Access)
   * or one in another region is reported at the first upload instead of as broken images later.
   */
  private async confirmPublicRead(key: string, url: string): Promise<void> {
    if (this.publicReadConfirmed) return;
    let status: number;
    try {
      status = (await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) })).status;
    } catch {
      return; // the check itself could not run (no outbound access): do not block the upload
    }
    if (status >= 200 && status < 300) {
      this.publicReadConfirmed = true;
      return;
    }
    await this.delete(key).catch(() => undefined);
    throw new ServiceUnavailableError(
      url.includes('.amazonaws.com/')
        ? `The image was stored in bucket "${this.opts.bucket}" but cannot be read publicly (S3 answered ${status}).`
        : `The image was stored in bucket "${this.opts.bucket}" but cannot be read at ${url} (answered ${status}). When that is this API's /media, its task role needs s3:GetObject on ${this.opts.bucket}/${this.folder()}/*.`,
    );
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: this.objectKey(key) }));
  }

  private folder(): string {
    return this.opts.prefix.replace(/^\/+|\/+$/g, '');
  }

  private objectKey(key: string): string {
    return `${this.folder()}/${key}`;
  }
}

/** Used when no usable media bucket is configured: everything else works, uploads explain what is missing. */
export class UnavailableStorage implements IStorageProvider {
  readonly publicBaseUrl = '';

  async put(): Promise<{ url: string }> {
    throw new ServiceUnavailableError('Image upload is not available yet: the media bucket (S3_BUCKET) is not configured for this environment.');
  }

  async delete(): Promise<void> {}
}
