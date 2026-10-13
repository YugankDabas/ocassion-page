import type { RequestListener } from 'node:http';
import { describeDatabaseTarget, isDerivedDatabaseUrl, isPlaceholderValue, readSetting } from './config/database';
import { keysFromSecret, type SecretsReport } from './config/secrets';

/**
 * What the service knows about its own start-up, and how it reports it on GET /healthz:
 *  - whether the Secrets Manager secret could be read, and which settings were found (names only, never values),
 *  - what is wrong, in words, while the service is not ready yet.
 * Error texts are shown only until the service is ready, with passwords and keys removed.
 */

declare const __BUILD_TIME__: string | undefined;
/** When this build was made (set by the bundler), to tell which build is running. */
export const BUILT_AT = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : 'development';

export interface StartupReport {
  startedAt: string;
  /** Settings loaded, database schema applied and first-run data present: the API is serving requests. */
  ready: boolean;
  secretsManager: SecretsReport;
  /** Why the settings could not be used (a missing or malformed value). */
  configurationError: string | null;
  /** Settings that are wrong but do not stop the service (see configurationProblems). */
  warnings: string[];
  /** Why the database could not be prepared on the last attempt. */
  databaseError: string | null;
  /** Why the view for gyftr.com (integration.published_pages) could not be created. Does not stop the panel. */
  integrationViewError: string | null;
  attempts: number;
  lastAttemptAt: string | null;
}

export const newStartupReport = (): StartupReport => ({
  startedAt: new Date().toISOString(),
  ready: false,
  secretsManager: { used: false, secretName: null, fetched: false, validJson: null, keysRead: [], error: null },
  configurationError: null,
  warnings: [],
  databaseError: null,
  integrationViewError: null,
  attempts: 0,
  lastAttemptAt: null,
});

/** For code that builds the application outside the start-up sequence (tests). */
export const readyReport = (): StartupReport => ({ ...newStartupReport(), ready: true });

const REQUIRED = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'PAGE_PUBLIC_BASE_URL'] as const;
const OPTIONAL: Record<string, string> = {
  DB_PORT: 'optional, 5432 is used',
  S3_BUCKET: 'optional, image upload is disabled until it is set',
  ADMIN_FRONTEND_ORIGIN: 'optional, http://localhost:5173 is used',
};
const DB_FIELDS = new Set(['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']);

/**
 * Turns a database start-up error into a short, non-sensitive category.
 * Only fixed words and Prisma's public error code (P1000…) are returned, never the message itself.
 */
export function databaseFailureReason(message: string): string {
  const code = /\bP\d{4}\b/.exec(message)?.[0];
  const category =
    /template placeholder/i.test(message) ? `placeholder_value_in ${(message.split(': ').pop() ?? '').replace(/[^A-Z_, ]/g, '')}`
    : /P1001|P1002|P1008|Can't reach database server|timed out|timeout|Connection terminated|ETIMEDOUT|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN/i.test(message) ? 'cannot_reach_database_server'
    : /P1000|authentication failed|password authentication/i.test(message) ? 'wrong_user_or_password'
    : /pg_hba\.conf/i.test(message) ? 'connection_rejected_by_database_server'
    : /P1011|\bTLS\b|\bSSL\b|certificate/i.test(message) ? 'tls_error'
    : /P1010|permission denied|must be owner|denied access/i.test(message) ? 'permission_denied'
    : /P1003|database .* does not exist/i.test(message) ? 'database_does_not_exist'
    : /P3009|P3018|failed migrations|migration.*failed to apply/i.test(message) ? 'migration_failed'
    : /ENOENT|EACCES|Cannot find module/i.test(message) ? 'migration_files_missing'
    : /Database configuration is incomplete/i.test(message) ? 'database_settings_missing'
    : 'other';
  return code ? `${category} (${code})` : category;
}

/** What to do about each kind of database failure, with the real user and database names filled in. */
function databaseFix(reason: string, target: { database: string; user: string } | null): string {
  const user = target?.user ?? '<DB_USER>';
  const database = target?.database ?? '<DB_NAME>';
  const fixes: Record<string, string> = {
    cannot_reach_database_server: 'Network: allow PostgreSQL (port 5432) from the backend ECS tasks in the RDS security group, and check DB_HOST and DB_PORT.',
    wrong_user_or_password: 'Check DB_USER and DB_PASSWORD in the secret (the corrected secret is picked up automatically within 15 seconds).',
    database_does_not_exist: `Create the database "${database}", or set DB_NAME to the name of the database that exists.`,
    permission_denied: `The user "${user}" may not create tables. Run as the database owner, connected to "${database}":  GRANT USAGE, CREATE ON SCHEMA public TO "${user}";   (on PostgreSQL 15 and newer, GRANT ALL ON DATABASE does not include this). If the message says "create database", the database "${database}" does not exist: create it or correct DB_NAME.`,
    tls_error: 'The encrypted connection to the database could not be set up. Send this error to the application developer.',
    connection_rejected_by_database_server: 'The database server refuses this user from this address (pg_hba). Check DB_USER, and that the server accepts TLS connections from the backend.',
    migration_failed: 'A schema change failed. The start-up step retries it by itself; if this stays, send this error to the application developer.',
    migration_files_missing: 'The folder prisma/migrations is missing from the container image (it must be at ./prisma/migrations next to dist).',
    database_settings_missing: 'Add the missing DB_* keys to the secret.',
  };
  const key = Object.keys(fixes).find((k) => reason.startsWith(k));
  return key ? fixes[key]! : reason.startsWith('placeholder_value_in') ? 'Replace the placeholder values in the secret with the real ones.' : 'See the error text.';
}

/** An error text made safe to show: no password, no signing key, no credentials inside a connection URL. */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  // eslint-disable-next-line no-control-regex
  let out = text.replace(/\u001b\[[0-9;]*m/g, '');
  for (const key of ['DB_PASSWORD', 'JWT_SECRET']) {
    const value = readSetting(env, key);
    if (!value || value.length < 4) continue;
    out = out.split(value).join('***').split(encodeURIComponent(value)).join('***');
  }
  out = out.replace(/(postgres(?:ql)?:\/\/[^:/\s]+:)[^@\s]+@/gi, '$1***@').replace(/\s+/g, ' ').trim();
  return out.length > 900 ? `${out.slice(0, 900)}…` : out;
}

/** For each setting: whether it is there and where it came from. Never its value. */
function settingsStatus(env: NodeJS.ProcessEnv): { settings: Record<string, string>; missing: string[] } {
  const fromSecret = keysFromSecret(env);
  // Local development gives DATABASE_URL directly; the separate DB_* fields are then not used.
  const urlGiven = !!readSetting(env, 'DATABASE_URL') && !isDerivedDatabaseUrl(env);
  const settings: Record<string, string> = {};
  const missing: string[] = [];
  for (const key of [...REQUIRED.slice(0, 1), 'DB_PORT', ...REQUIRED.slice(1), 'S3_BUCKET', 'ADMIN_FRONTEND_ORIGIN']) {
    const value = readSetting(env, key);
    const required = (REQUIRED as readonly string[]).includes(key);
    if (!value && urlGiven && DB_FIELDS.has(key)) settings[key] = 'not used (DATABASE_URL is given)';
    else if (!value && required) {
      settings[key] = 'MISSING';
      missing.push(key);
    } else if (!value) settings[key] = `not set (${OPTIONAL[key]})`;
    else {
      const source = fromSecret.has(key) ? 'from the secret' : 'from the environment';
      settings[key] = isPlaceholderValue(value) ? `PLACEHOLDER, not a real value (${source})` : `set (${source})`;
      if (isPlaceholderValue(value) && required) missing.push(key);
    }
  }
  return { settings, missing };
}

/** The body of GET /healthz. */
export function healthPayload(report: StartupReport, env: NodeJS.ProcessEnv = process.env) {
  const { settings, missing } = settingsStatus(env);
  const { secretsManager } = report;
  const database = report.ready
    ? 'ready'
    : secretsManager.error || report.configurationError
      ? 'not_configured'
      : report.databaseError
        ? 'unavailable'
        : 'starting';

  const target = describeDatabaseTarget(readSetting(env, 'DATABASE_URL') ?? '');
  const reason = database === 'unavailable' ? databaseFailureReason(report.databaseError!) : null;
  const warnings = [...report.warnings];
  if (report.integrationViewError) {
    warnings.push(
      `The view for gyftr.com (integration.published_pages) could not be created; the panel itself is not affected. ${redact(report.integrationViewError, env)} To fix, run as the database owner:  GRANT CREATE ON DATABASE "${target?.database ?? '<DB_NAME>'}" TO "${target?.user ?? '<DB_USER>'}";  It is retried every minute.`,
    );
  }

  const errors: string[] = [];
  if (!report.ready) {
    if (secretsManager.error) errors.push(`Secrets Manager: ${redact(secretsManager.error, env)}`);
    if (report.configurationError) errors.push(`Configuration: ${redact(report.configurationError, env)}`);
    if (database === 'unavailable') errors.push(`Database: ${redact(report.databaseError!, env)}`);
  }

  return {
    status: 'ok',
    database,
    ...(reason ? { reason, fix: databaseFix(reason, target) } : {}),
    builtAt: BUILT_AT,
    startedAt: report.startedAt,
    secretsManager: {
      used: secretsManager.used,
      secretName: secretsManager.secretName,
      fetched: secretsManager.fetched,
      validJson: secretsManager.validJson,
      settingsReadFromSecret: secretsManager.keysRead,
    },
    settings,
    allRequiredSettingsPresent: missing.length === 0,
    integrationView: !report.ready ? 'pending' : report.integrationViewError ? 'unavailable' : 'ready',
    warnings,
    errors,
    // Connection details help while fixing a start-up problem; they are not shown once the service is running.
    ...(report.ready ? {} : { attempts: report.attempts, lastAttemptAt: report.lastAttemptAt, databaseTarget: target }),
  };
}

/**
 * Answers requests until the application itself can: the health check always succeeds and says what
 * is wrong, and the panel gets a readable "starting" reply instead of a connection failure.
 */
export function startingHandler(report: StartupReport, env: NodeJS.ProcessEnv = process.env): RequestListener {
  return (req, res) => {
    const origin = req.headers.origin;
    if (origin && origin === readSetting(env, 'ADMIN_FRONTEND_ORIGIN')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const isHealth = (req.url ?? '').split('?')[0] === '/healthz';
    const body = isHealth
      ? healthPayload(report, env)
      : { error: { code: 'STARTING', message: 'The service is starting or is not configured yet. Try again in a moment.' } };
    res.writeHead(isHealth ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
}
