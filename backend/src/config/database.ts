/**
 * The database is configured with separate fields:
 *
 *   DB_HOST, DB_NAME, DB_USER, DB_PASSWORD   (required)
 *   DB_PORT                                  (optional, default 5432)
 *
 * Prisma needs one connection URL, so it is assembled here, in memory, at start-up
 * and never stored. Names are matched case-insensitively (`db_host`, `Db_Host` and
 * `DB_HOST` are the same key) and surrounding spaces are ignored.
 *
 * Local development may set DATABASE_URL directly instead (the Prisma CLI reads it
 * from `.env`); when it is present it is used as it is.
 */

export const DB_KEYS = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;
const REQUIRED: readonly (typeof DB_KEYS)[number][] = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** Value of an environment variable, whatever the case of its name. Empty and blank values count as missing. */
export function readSetting(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const wanted = name.toUpperCase();
  const exact = env[wanted]?.trim();
  if (exact) return exact;
  for (const [key, value] of Object.entries(env)) {
    if (key.toUpperCase() === wanted && value?.trim()) return value.trim();
  }
  return undefined;
}

/** Sets env.DATABASE_URL from the DB_* fields unless a DATABASE_URL is already given. */
export function applyDatabaseUrl(env: NodeJS.ProcessEnv = process.env): void {
  if (readSetting(env, 'DATABASE_URL')) {
    env.DATABASE_URL = readSetting(env, 'DATABASE_URL');
    return;
  }
  const missing = REQUIRED.filter((key) => !readSetting(env, key));
  if (missing.length === REQUIRED.length) return; // nothing configured: the settings validation reports it
  if (missing.length) throw new Error(`Database configuration is incomplete. Missing: ${missing.join(', ')}`);

  const host = readSetting(env, 'DB_HOST')!;
  const port = readSetting(env, 'DB_PORT') ?? '5432';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error(`DB_PORT must be a port number, got "${port}"`);
  if (!/^[A-Za-z0-9.-]+$/.test(host)) throw new Error('DB_HOST must be a host name or IPv4 address, without a scheme, port or path');

  // User, password and database name may contain any character: they are percent-encoded.
  const user = encodeURIComponent(readSetting(env, 'DB_USER')!);
  const password = encodeURIComponent(readSetting(env, 'DB_PASSWORD')!);
  const name = encodeURIComponent(readSetting(env, 'DB_NAME')!);
  // TLS for every remote database; at most 10 connections per container.
  const options = `${LOCAL_HOSTS.has(host.toLowerCase()) ? '' : 'sslmode=require&'}connection_limit=10&pool_timeout=10`;
  env.DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${name}?${options}`;
}
