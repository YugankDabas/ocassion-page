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

/** The URL this module built for an environment, to tell it from one that was given. */
const derivedUrls = new WeakMap<NodeJS.ProcessEnv, string>();

/** True when DATABASE_URL was assembled from the DB_* fields (not given directly). */
export const isDerivedDatabaseUrl = (env: NodeJS.ProcessEnv = process.env): boolean => !!env.DATABASE_URL && env.DATABASE_URL === derivedUrls.get(env);

/**
 * Sets env.DATABASE_URL from the DB_* fields unless a DATABASE_URL is already given.
 * Safe to call again: a URL built on an earlier call is rebuilt from the current fields.
 */
export function applyDatabaseUrl(env: NodeJS.ProcessEnv = process.env): void {
  const given = readSetting(env, 'DATABASE_URL');
  if (given && !isDerivedDatabaseUrl(env)) {
    env.DATABASE_URL = given;
    return;
  }
  delete env.DATABASE_URL;
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
  // Every remote connection is encrypted (sslmode=require). The server certificate is not checked against a CA:
  // RDS certificates are signed by Amazon's own RDS root, which is not in the container's trust store, and strict
  // checking would refuse the connection. This is what `sslmode=require` means in PostgreSQL's own clients.
  // At most 10 connections per container.
  const options = `${LOCAL_HOSTS.has(host.toLowerCase()) ? '' : 'sslmode=require&sslaccept=accept_invalid_certs&'}connection_limit=10&pool_timeout=10`;
  env.DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${name}?${options}`;
  derivedUrls.set(env, env.DATABASE_URL);
}

/**
 * Database settings that still hold a template placeholder such as "<database-user>" instead of a
 * real value. They look valid to a parser, so the connection would just fail with a login error.
 */
export function placeholderDatabaseSettings(env: NodeJS.ProcessEnv = process.env): string[] {
  return DB_KEYS.filter((key) => isPlaceholderValue(readSetting(env, key)));
}

/** A value copied from a template ("<database-user>", "changeme") rather than a real one. */
export const isPlaceholderValue = (value: string | undefined): boolean => !!value && /^<.*>$|^(?:changeme|change-me|todo|xxx+|replace[-_ ]?me)$/i.test(value);

/** Where the application connects, without the password: for the start-up log. */
export function describeDatabaseTarget(databaseUrl: string): { host: string; port: string; database: string; user: string; tls: boolean } | null {
  try {
    const url = new URL(databaseUrl);
    return { host: url.hostname, port: url.port || '5432', database: decodeURIComponent(url.pathname.slice(1)), user: decodeURIComponent(url.username), tls: url.searchParams.get('sslmode') === 'require' };
  } catch {
    return null;
  }
}
