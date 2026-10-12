import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { NotFoundError, ValidationError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { IMediaRepository } from '../repositories/types';
import type { IStorageProvider } from '../storage/StorageProvider';
import type { Actor, AuditService } from './AuditService';

export interface UploadedFile {
  buffer: Buffer;
  originalName: string;
}

export interface ProcessedImage {
  body: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
}

export interface IImageProcessor {
  process(input: Buffer): Promise<ProcessedImage>;
}

/**
 * Decodes and re-encodes every upload. Decoding proves the file really is an
 * image (the client's Content-Type is never trusted), re-encoding strips EXIF /
 * GPS metadata and any polyglot payload, and output is optimised WebP.
 * SVG is intentionally not accepted (it can carry script).
 */
export class SharpImageProcessor implements IImageProcessor {
  private static readonly ACCEPTED = new Set(['jpeg', 'png', 'webp', 'gif', 'avif']);

  constructor(
    private readonly maxDimension = 2560,
    private readonly maxInputPixels = 40_000_000,
  ) {}

  async process(input: Buffer): Promise<ProcessedImage> {
    let meta: sharp.Metadata;
    try {
      meta = await sharp(input, { limitInputPixels: this.maxInputPixels }).metadata();
    } catch {
      throw new ValidationError('File is not a valid image');
    }
    if (!meta.format || !SharpImageProcessor.ACCEPTED.has(meta.format)) {
      throw new ValidationError('Only JPEG, PNG, WebP, GIF and AVIF images are allowed');
    }

    const animated = meta.format === 'gif' && (meta.pages ?? 1) > 1;
    const { data, info } = await sharp(input, { limitInputPixels: this.maxInputPixels, animated })
      .rotate()
      .resize({ width: this.maxDimension, height: this.maxDimension, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    return {
      body: data,
      mimeType: 'image/webp',
      extension: 'webp',
      width: info.width,
      height: animated && info.pageHeight ? info.pageHeight : info.height,
    };
  }
}

export class MediaService {
  constructor(
    private readonly media: IMediaRepository,
    private readonly storage: IStorageProvider,
    private readonly images: IImageProcessor,
    private readonly audit: AuditService,
    private readonly logger: Logger,
  ) {}

  list(opts: { page: number; pageSize: number; search?: string }) {
    return this.media.list(opts);
  }

  async upload(actor: Actor, file: UploadedFile, alt = '') {
    const image = await this.images.process(file.buffer);
    const now = new Date();
    const key = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${image.extension}`;
    const { url } = await this.storage.put(key, image.body, image.mimeType);

    try {
      const record = await this.media.create({
        storageKey: key,
        url,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        sizeBytes: image.body.length,
        originalName: file.originalName.replace(/[^\w.\- ]+/g, '_').slice(0, 200),
        alt: alt.slice(0, 200),
        uploadedById: actor.id,
      });
      await this.audit.record(actor, { action: 'media.upload', entityType: 'media', entityId: record.id });
      return record;
    } catch (err) {
      await this.storage.delete(key).catch((e) => this.logger.warn({ err: e, key }, 'Failed to clean up orphaned upload'));
      throw err;
    }
  }

  async updateAlt(actor: Actor, id: string, alt: string) {
    if (!(await this.media.findById(id))) throw new NotFoundError('Media');
    const record = await this.media.updateAlt(id, alt);
    await this.audit.record(actor, { action: 'media.update', entityType: 'media', entityId: id });
    return record;
  }

  async delete(actor: Actor, id: string) {
    const record = await this.media.findById(id);
    if (!record) throw new NotFoundError('Media');
    await this.media.delete(id);
    await this.storage.delete(record.storageKey).catch((err) => this.logger.warn({ err, id }, 'Failed to delete stored file'));
    await this.audit.record(actor, { action: 'media.delete', entityType: 'media', entityId: id });
  }
}
