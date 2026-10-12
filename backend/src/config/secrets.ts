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

/** Copies the known settings of a secret into `env`. Exported for tests. */
export function applySecret(secret: Record<string, unknown>, env: NodeJS.ProcessEnv): void {
  const present = new Set(
    Object.entries(env)
      .filter(([, value]) => value?.trim())
      .map(([key]) => key.toUpperCase()),
  );
  for (const [rawKey, value] of Object.entries(secret)) {
    const key = rawKey.trim().toUpperCase();
    if (!KNOWN_KEYS.has(key) || present.has(key)) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
    const text = String(value).trim();
    if (!text) continue;
    env[key] = text;
    present.add(key);
  }
}

export async function loadSecretsIntoEnv(env: NodeJS.ProcessEnv = process.env, attempts = 3): Promise<void> {
  const secretName = env.AWS_SECRET_NAME?.trim();
  if (secretName) {
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
        applySecret(values, env);
        break;
      } catch (err) {
        if (err instanceof SecretFormatError || attempt >= attempts) throw new Error(`Could not read secret "${secretName}" from AWS Secrets Manager: ${(err as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }
  applyDatabaseUrl(env);
}
