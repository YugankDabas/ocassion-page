import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ServiceUnavailableError } from '../lib/errors';

/** Where uploaded files live: S3 when S3_BUCKET is set, local disk otherwise. Callers do not know which. */
export interface IStorageProvider {
  /** Every stored file's URL starts with this. */
  readonly publicBaseUrl: string;
  put(key: string, body: Buffer, contentType: string): Promise<{ url: string }>;
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
 * An S3 bucket. Only its name is configured: the region is the service's AWS region and files are
 * served from the bucket's own https address, so the bucket must allow public reads of its objects.
 * Uses the default AWS credential chain (the ECS task role); no access keys are stored.
 */
export class S3Storage implements IStorageProvider {
  private readonly client: S3Client;
  readonly publicBaseUrl: string;
  /** Set once an uploaded file has been fetched back over its public address. */
  private publicReadConfirmed = false;

  constructor(private readonly opts: { bucket: string; region: string; prefix: string }) {
    this.client = new S3Client({ region: opts.region });
    this.publicBaseUrl = `https://${opts.bucket}.s3.${opts.region}.amazonaws.com`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<{ url: string }> {
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
    const url = `${this.publicBaseUrl}/${objectKey}`;
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
      `The image was stored in bucket "${this.opts.bucket}" but cannot be read publicly (S3 answered ${status}). The bucket must be in ${this.opts.region} and allow public reads of its objects.`,
    );
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: this.objectKey(key) }));
  }

  private objectKey(key: string): string {
    return this.opts.prefix ? `${this.opts.prefix.replace(/\/$/, '')}/${key}` : key;
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
