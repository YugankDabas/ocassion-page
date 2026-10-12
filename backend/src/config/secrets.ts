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
        const secret: unknown = JSON.parse(res.SecretString ?? '{}');
        if (!secret || typeof secret !== 'object' || Array.isArray(secret)) throw new Error('the secret is not a JSON object of key/value pairs');
        applySecret(secret as Record<string, unknown>, env);
        break;
      } catch (err) {
        if (attempt >= attempts) throw new Error(`Could not read secret "${secretName}" from AWS Secrets Manager: ${(err as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }
  applyDatabaseUrl(env);
}
