import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const secret = (name: string) =>
  z.string().min(32, `${name} must be at least 32 characters (use: openssl rand -base64 48)`);

const settings = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /**
   * Origin of the admin panel (scheme + host, no path), e.g. https://occasion-admin.gyftr.net.
   * The panel is a separate service: this is the only browser origin allowed to call the API and
   * to show the page preview in a frame. The default is the local Vite dev server.
   */
  ADMIN_FRONTEND_ORIGIN: z
    .string()
    .url()
    .refine((v) => URL.canParse(v) && new URL(v).origin === v, 'must be an origin only, e.g. https://occasion-admin.gyftr.net (no path, no trailing slash)')
    .default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Number of reverse-proxy hops in front of the API (for correct client IPs / rate limiting). */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),

  /** Assembled at start-up from DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD (config/database.ts). */
  DATABASE_URL: z.string({ required_error: 'Set DB_HOST, DB_NAME, DB_USER and DB_PASSWORD' }).url(),
  /**
   * Create / update the database schema when the server starts, by applying prisma/migrations.
   * On by default, so an empty database only has to exist. Safe with several containers (Prisma
   * takes a lock) and a no-op when the schema is current. Set to false to manage migrations yourself.
   */
  RUN_MIGRATIONS_ON_START: bool.default('true'),

  JWT_SECRET: secret('JWT_SECRET'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(8),

  /**
   * Password of the read-only database login the gyftr.com tech team connects with (occasion_tech_reader).
   * When set, the login is created at start-up by prisma/tech_reader.sql. Optional: without it no login is created.
   */
  TECH_READER_PASSWORD: z.string().min(16, 'TECH_READER_PASSWORD must be at least 16 characters (use: openssl rand -base64 24)').optional(),

  /** Public base URL the pages are served under, e.g. https://www.gyftr.com/occasion */
  PAGE_PUBLIC_BASE_URL: z.string().url(),

  /** Directory of the built admin panel, served by this API (set by the deployment). */
  SERVE_FRONTEND_DIR: z.string().optional(),

  /**
   * Uploaded images. With S3_BUCKET set they go to that bucket (in AWS_REGION) and are served
   * from the bucket's own https address. Without it (local development) they are written to
   * LOCAL_UPLOAD_DIR and served by this API under PUBLIC_UPLOADS_BASE_URL.
   */
  S3_BUCKET: z.string().trim().optional(),
  S3_PREFIX: z.string().default('occasion-pages'),
  AWS_REGION: z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/, 'must be an AWS region such as ap-south-1').default('ap-south-1'),
  LOCAL_UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_UPLOADS_BASE_URL: z.string().url().optional(),
  MAX_UPLOAD_MB: z.coerce.number().min(1).max(25).default(8),
});

/** Every setting name this application reads (used to pick them out of the Secrets Manager secret). */
export const SETTING_KEYS = Object.keys(settings.shape);

const envSchema = settings.superRefine((env, ctx) => {
  if (!env.S3_BUCKET && env.NODE_ENV !== 'production' && !env.PUBLIC_UPLOADS_BASE_URL) {
    ctx.addIssue({ code: 'custom', path: ['PUBLIC_UPLOADS_BASE_URL'], message: 'Set S3_BUCKET, or PUBLIC_UPLOADS_BASE_URL to store uploads on local disk' });
  }
});

/** A bucket name usable in the bucket's https address: lowercase letters, digits and hyphens (no dots). */
export const isBucketName = (name: string | undefined): name is string => !!name && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name);

/**
 * Settings that are wrong but must not keep the service down: it starts, logs these, and the
 * affected feature says what is missing. (A missing database or JWT secret still stops the start.)
 */
export function configurationProblems(env: Env): string[] {
  const problems: string[] = [];
  if (env.isProduction && !env.ADMIN_FRONTEND_ORIGIN.startsWith('https://')) {
    problems.push(`ADMIN_FRONTEND_ORIGIN is "${env.ADMIN_FRONTEND_ORIGIN}": it must be the https address of the admin panel, otherwise the panel's requests are refused`);
  }
  if (!env.S3_BUCKET) {
    if (env.isProduction) problems.push('S3_BUCKET is not set: image upload is disabled until it is');
  } else if (!isBucketName(env.S3_BUCKET)) {
    problems.push(`S3_BUCKET "${env.S3_BUCKET}" is not usable (lowercase letters, digits and hyphens only; no dots, no s3:// prefix): image upload is disabled`);
  }
  return problems;
}

export type Env = z.infer<typeof envSchema> & { isProduction: boolean };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return { ...parsed.data, isProduction: parsed.data.NODE_ENV === 'production' };
}
