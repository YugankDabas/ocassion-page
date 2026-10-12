import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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
    return { url: `${this.publicBaseUrl}/${objectKey}` };
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: this.objectKey(key) }));
  }

  private objectKey(key: string): string {
    return this.opts.prefix ? `${this.opts.prefix.replace(/\/$/, '')}/${key}` : key;
  }
}
