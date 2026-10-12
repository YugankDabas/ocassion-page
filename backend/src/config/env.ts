import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const secret = (name: string) =>
  z.string().min(32, `${name} must be at least 32 characters (use: openssl rand -base64 48)`);

const settings = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Number of reverse-proxy hops in front of the API (for correct client IPs / rate limiting). */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),

  /** Assembled at start-up from DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD (config/database.ts). */
  DATABASE_URL: z.string({ required_error: 'Set DB_HOST, DB_NAME, DB_USER and DB_PASSWORD' }).url(),
  /** Apply pending database migrations when the server starts (safe with several instances: Prisma takes a lock). */
  RUN_MIGRATIONS_ON_START: bool.default('false'),

  JWT_SECRET: secret('JWT_SECRET'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(8),

  /** Public base URL the pages are served under, e.g. https://www.gyftr.com/occasion */
  PAGE_PUBLIC_BASE_URL: z.string().url(),

  /** Directory of the built admin panel, served by this API (set by the deployment). */
  SERVE_FRONTEND_DIR: z.string().optional(),

  /**
   * Uploaded images. With S3_BUCKET set they go to that bucket (in AWS_REGION) and are served
   * from the bucket's own https address. Without it (local development) they are written to
   * LOCAL_UPLOAD_DIR and served by this API under PUBLIC_UPLOADS_BASE_URL.
   */
  S3_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'must be a bucket name: lowercase letters, digits and hyphens (no dots, no s3:// prefix)')
    .optional(),
  S3_PREFIX: z.string().default('occasion-pages'),
  AWS_REGION: z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/, 'must be an AWS region such as ap-south-1').default('ap-south-1'),
  LOCAL_UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_UPLOADS_BASE_URL: z.string().url().optional(),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(25).default(8),
});

/** Every setting name this application reads (used to pick them out of the Secrets Manager secret). */
export const SETTING_KEYS = Object.keys(settings.shape);

const envSchema = settings.superRefine((env, ctx) => {
  if (env.S3_BUCKET) return;
  if (env.NODE_ENV === 'production') {
    // A container's disk is lost on every deploy, so deployed environments must store uploads in S3.
    ctx.addIssue({ code: 'custom', path: ['S3_BUCKET'], message: 'S3_BUCKET is required when NODE_ENV=production' });
  } else if (!env.PUBLIC_UPLOADS_BASE_URL) {
    ctx.addIssue({ code: 'custom', path: ['PUBLIC_UPLOADS_BASE_URL'], message: 'Set S3_BUCKET, or PUBLIC_UPLOADS_BASE_URL to store uploads on local disk' });
  }
});

export type Env = z.infer<typeof envSchema> & { isProduction: boolean };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return { ...parsed.data, isProduction: parsed.data.NODE_ENV === 'production' };
}
