import type { RequestListener } from 'node:http';
import { describeDatabaseTarget, isDerivedDatabaseUrl, isPlaceholderValue, readSetting } from './config/database';
import type { SecretsReport } from './config/secrets';

/**
 * What the service knows about its own start-up, and how it reports it on GET /healthz:
 * whether the secret was read, which settings are missing (names only, never a value),
 * and what is wrong, in words, with passwords and keys removed.
 */

declare const __BUILD_TIME__: string | undefined;
/** When this build was made (set by the bundler), to tell which build is running. */
export const BUILT_AT = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : 'development';

export interface StartupReport {
  /** Settings loaded, database schema applied and first-run data present: the API is serving requests. */
  ready: boolean;
  secretsManager: SecretsReport;
  /** Why the settings could not be used (a missing or malformed value). */
  configurationError: string | null;
  /** Settings that are wrong but do not stop the service (see configurationProblems). */
  warnings: string[];
  /** Why the database could not be prepared on the last attempt. */
  databaseError: string | null;
  /** Why the tech team's read-only login could not be set up. Does not affect the panel. */
  techReaderError: string | null;
}

export const newStartupReport = (): StartupReport => ({
  ready: false,
  secretsManager: { used: false, secretName: null, fetched: false, validJson: null, keysRead: [], error: null },
  configurationError: null,
  warnings: [],
  databaseError: null,
  techReaderError: null,
});

/** For code that builds the application outside the start-up sequence (tests). */
export const readyReport = (): StartupReport => ({ ...newStartupReport(), ready: true });

const REQUIRED = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'PAGE_PUBLIC_BASE_URL'];
const DB_FIELDS = new Set(['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']);

/** Turns a database start-up error into a short category, used to choose the advice shown with it. */
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
function databaseFix(reason: string, target: { database: string; user: string } | null): string | null {
  const user = target?.user ?? '<DB_USER>';
  const database = target?.database ?? '<DB_NAME>';
  const fixes: Record<string, string> = {
    cannot_reach_database_server: 'allow PostgreSQL (port 5432) from the backend ECS tasks in the RDS security group, and check DB_HOST and DB_PORT.',
    wrong_user_or_password: 'check DB_USER and DB_PASSWORD in the secret (a corrected secret is picked up within 15 seconds).',
    database_does_not_exist: `create the database "${database}", or set DB_NAME to the name of the database that exists.`,
    permission_denied: `the user "${user}" may not create tables. Run as the database owner, connected to "${database}":  GRANT USAGE, CREATE ON SCHEMA public TO "${user}";`,
    connection_rejected_by_database_server: 'the database server refuses this user from this address. Check DB_USER, and that the server accepts TLS connections from the backend.',
    migration_files_missing: 'the folder prisma/migrations is missing from the container image (it must be at ./prisma/migrations next to dist).',
    database_settings_missing: 'add the missing DB_* keys to the secret.',
    placeholder_value_in: 'replace the placeholder values in the secret with the real ones.',
  };
  const key = Object.keys(fixes).find((k) => reason.startsWith(k));
  return key ? fixes[key]! : null;
}

/** An error text made safe to show: no password, no signing key, no credentials inside a connection URL. */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  // eslint-disable-next-line no-control-regex
  let out = text.replace(/\u001b\[[0-9;]*m/g, '');
  for (const key of ['DB_PASSWORD', 'JWT_SECRET', 'TECH_READER_PASSWORD']) {
    const value = readSetting(env, key);
    if (!value || value.length < 4) continue;
    out = out.split(value).join('***').split(encodeURIComponent(value)).join('***');
  }
  out = out.replace(/(postgres(?:ql)?:\/\/[^:/\s]+:)[^@\s]+@/gi, '$1***@').replace(/\s+/g, ' ').trim();
  return out.length > 900 ? `${out.slice(0, 900)}…` : out;
}

/** Names of the required settings that are absent or still hold a template placeholder. Never a value. */
function missingSettings(env: NodeJS.ProcessEnv): string[] {
  // Local development gives DATABASE_URL directly; the separate DB_* fields are then not needed.
  const urlGiven = !!readSetting(env, 'DATABASE_URL') && !isDerivedDatabaseUrl(env);
  return REQUIRED.filter((key) => {
    if (urlGiven && DB_FIELDS.has(key)) return false;
    const value = readSetting(env, key);
    return !value || isPlaceholderValue(value);
  });
}

/**
 * The body of GET /healthz:
 *   status    always "ok" (the process is up; this is what the load balancer checks)
 *   database  ready | starting | unavailable | not_configured
 *   builtAt   when the running build was made
 *   secrets   whether the Secrets Manager secret was fetched, and which required settings are missing
 *   errors    what is wrong, with what to do about it
 */
export function healthPayload(report: StartupReport, env: NodeJS.ProcessEnv = process.env) {
  const { secretsManager } = report;
  const database = report.ready
    ? 'ready'
    : secretsManager.error || report.configurationError
      ? 'not_configured'
      : report.databaseError
        ? 'unavailable'
        : 'starting';

  const errors: string[] = [];
  if (secretsManager.error) errors.push(`Secrets Manager: ${redact(secretsManager.error, env)}`);
  else if (secretsManager.validJson === false) errors.push('Secrets Manager: the secret is not valid JSON (it was still read). Put every value in double quotes.');
  if (!report.ready && report.configurationError) errors.push(`Configuration: ${redact(report.configurationError, env)}`);
  if (database === 'unavailable') {
    const fix = databaseFix(databaseFailureReason(report.databaseError!), describeDatabaseTarget(readSetting(env, 'DATABASE_URL') ?? ''));
    errors.push(`Database: ${redact(report.databaseError!, env)}${fix ? ` | Fix: ${fix}` : ''}`);
  }
  if (report.techReaderError) {
    const user = describeDatabaseTarget(readSetting(env, 'DATABASE_URL') ?? '')?.user ?? '<DB_USER>';
    const fix = /permission denied to create role/i.test(report.techReaderError)
      ? ` | Fix: the panel's database user may not create logins. Run as the database administrator:  ALTER ROLE "${user}" CREATEROLE;  The login is then created within a minute, and the right can be taken away again:  ALTER ROLE "${user}" NOCREATEROLE;`
      : /may not (change it|set them)/i.test(report.techReaderError)
        ? ' | Fix: see "How the login is created" in docs/INTEGRATION_DATABASE.md.'
        : '';
    errors.push(`Tech login: ${redact(report.techReaderError, env)}${fix}`);
  }
  errors.push(...report.warnings);

  return {
    status: 'ok',
    database,
    builtAt: BUILT_AT,
    secrets: {
      source: secretsManager.used ? 'AWS Secrets Manager' : 'environment',
      ...(secretsManager.used ? { fetched: secretsManager.fetched } : {}),
      missing: missingSettings(env),
    },
    errors,
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
