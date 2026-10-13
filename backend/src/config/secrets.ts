import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { applyDatabaseUrl, DB_KEYS } from './database';
import { SETTING_KEYS } from './env';

/**
 * Deployed environments keep every setting in ONE AWS Secrets Manager secret
 * (the same pattern as the other GyFTR panels). When AWS_SECRET_NAME is set,
 * its JSON keys are copied into process.env before the configuration is
 * validated, so "put it in the secret" is all that is required.
 *
 * - Only the settings this application knows are copied; any other key in the
 *   secret is ignored.
 * - Key names are matched case-insensitively (`db_host`, `Db_Host`, `DB_HOST`).
 * - A value already present in the environment wins, so a task definition can
 *   still override a single setting.
 *
 * Locally (no AWS_SECRET_NAME) nothing is fetched and `.env` is used.
 * In both cases the database URL is then assembled from the DB_* fields.
 */

const KNOWN_KEYS = new Set<string>([...SETTING_KEYS, ...DB_KEYS]);

/** The secret was fetched but its content is unusable: retrying will not help. */
class SecretFormatError extends Error {}

/**
 * Reads the secret's text. It should be a JSON object: {"DB_HOST": "…", "DB_NAME": "…"}.
 *
 * A secret typed by hand in the console's "Plaintext" tab is often almost JSON, with a value left
 * unquoted ("DB_NAME": occasion_admin) or written as KEY=value lines. Rather than refusing to
 * start, such a secret is read line by line and a warning says how to fix it. Exported for tests.
 */
export function parseSecret(text: string): { values: Record<string, unknown>; lenient: boolean } {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { values: parsed as Record<string, unknown>, lenient: false };
  } catch {
    // fall through to the line-by-line reading
  }
  const values: Record<string, unknown> = {};
  // KEY, then ":" or "=", then a "double-quoted", 'single-quoted' or bare value. A bare value runs to the end of
  // its line (commas and braces inside it are kept); on a single line it ends where the next `, KEY:` begins.
  const entry = /"?([A-Za-z_][A-Za-z0-9_]*)"?[ \t]*[:=][ \t]*("(?:[^"\\]|\\.)*"|'[^']*'|[^\r\n]*?(?=[ \t]*,?[ \t]*(?:[\r\n]|\}?\s*$|,[ \t]*"?[A-Za-z_][A-Za-z0-9_]*"?[ \t]*[:=])))/g;
  for (const [, key = '', raw = ''] of text.matchAll(entry)) {
    let value: unknown = raw.trim();
    if (raw.startsWith('"')) {
      try {
        value = JSON.parse(raw);
      } catch {
        value = raw.slice(1, -1);
      }
    } else if (raw.startsWith("'")) value = raw.slice(1, -1);
    values[key] = value;
  }
  if (Object.keys(values).length === 0) {
    throw new SecretFormatError('the secret is not a JSON object. Store it as key/value pairs, e.g. {"DB_HOST": "…", "DB_NAME": "occasion_admin"}');
  }
  return { values, lenient: true };
}

/** Settings that were copied from the secret (not given in the environment), per environment object. */
const appliedFromSecret = new WeakMap<NodeJS.ProcessEnv, Set<string>>();

/** Names of the settings that came from the secret. */
export const keysFromSecret = (env: NodeJS.ProcessEnv = process.env): ReadonlySet<string> => appliedFromSecret.get(env) ?? new Set<string>();

/**
 * Copies the known settings of a secret into `env` and returns their names.
 * Reading again replaces what an earlier read had set, so a corrected secret takes effect without a restart.
 */
export function applySecret(secret: Record<string, unknown>, env: NodeJS.ProcessEnv): string[] {
  for (const key of appliedFromSecret.get(env) ?? []) delete env[key];
  const present = new Set(
    Object.entries(env)
      .filter(([, value]) => value?.trim())
      .map(([key]) => key.toUpperCase()),
  );
  const applied = new Set<string>();
  for (const [rawKey, value] of Object.entries(secret)) {
    const key = rawKey.trim().toUpperCase();
    if (!KNOWN_KEYS.has(key) || present.has(key)) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    const text = String(value).trim();
    if (!text) continue;
    env[key] = text;
    present.add(key);
    applied.add(key);
  }
  appliedFromSecret.set(env, applied);
  return [...applied];
}

/** What happened when the secret was read. Holds names only, never a value. */
export interface SecretsReport {
  /** False when AWS_SECRET_NAME is not set (local development): settings come from the environment. */
  used: boolean;
  secretName: string | null;
  fetched: boolean;
  /** False when the secret was readable but not valid JSON (it was then read line by line). */
  validJson: boolean | null;
  /** Names of the settings taken from the secret. */
  keysRead: string[];
  error: string | null;
}

/**
 * Reads the secret named by AWS_SECRET_NAME into `env`. Never throws: a failure is returned in `error`,
 * so the caller can report it and try again.
 */
export async function fetchSecret(env: NodeJS.ProcessEnv = process.env, attempts = 3): Promise<SecretsReport> {
  const secretName = env.AWS_SECRET_NAME?.trim();
  if (!secretName) return { used: false, secretName: null, fetched: false, validJson: null, keysRead: [], error: null };
  const client = new SecretsManagerClient({ region: env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? 'ap-south-1' });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
      const { values, lenient } = parseSecret(res.SecretString ?? '');
      if (lenient) {
        // eslint-disable-next-line no-console
        console.warn(
          `WARNING: secret "${secretName}" is not valid JSON and was read leniently. Fix it in Secrets Manager: every value must be in double quotes, e.g. "DB_NAME": "occasion_admin" (use the Key/value tab).`,
        );
      }
      return { used: true, secretName, fetched: true, validJson: !lenient, keysRead: applySecret(values, env), error: null };
    } catch (err) {
      if (err instanceof SecretFormatError || attempt >= attempts) {
        return { used: true, secretName, fetched: false, validJson: err instanceof SecretFormatError ? false : null, keysRead: [], error: `Could not read secret "${secretName}" from AWS Secrets Manager: ${(err as Error).message}` };
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

/** Secret (when configured) → environment, then DB_* → database URL. Throws when the secret cannot be read. */
export async function loadSecretsIntoEnv(env: NodeJS.ProcessEnv = process.env, attempts = 3): Promise<SecretsReport> {
  const report = await fetchSecret(env, attempts);
  if (report.error) throw new Error(report.error);
  applyDatabaseUrl(env);
  return report;
}
