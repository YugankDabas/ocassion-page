import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { applyDatabaseUrl } from '../src/config/database';
import { applySecret } from '../src/config/secrets';
import { healthPayload, newStartupReport, redact, startingHandler } from '../src/startup';

const PASSWORD = 'S3cr3t/Pass:word@1';
const JWT = 'j'.repeat(48);
const panel = 'https://occasion-admin.gyftr.net';

/** An environment as it is on ECS after the secret was read. */
function deployedEnv(secret: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', AWS_SECRET_NAME: 'occasion-admin', ADMIN_FRONTEND_ORIGIN: panel };
  applySecret({ DB_HOST: 'db.abc.ap-south-1.rds.amazonaws.com', DB_NAME: 'occasion-admin', DB_USER: 'occasion', DB_PASSWORD: PASSWORD, JWT_SECRET: JWT, PAGE_PUBLIC_BASE_URL: 'https://www.gyftr.com/occasion', S3_BUCKET: '', ...secret }, env);
  applyDatabaseUrl(env);
  return env;
}

describe('GET /healthz', () => {
  it('lists every setting by name with where it came from, and never a value', () => {
    const env = deployedEnv();
    const report = { ...newStartupReport(), secretsManager: { used: true, secretName: 'occasion-admin', fetched: true, validJson: true, keysRead: ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'PAGE_PUBLIC_BASE_URL'], error: null } };
    const body = healthPayload(report, env);
    expect(body).toMatchObject({
      status: 'ok',
      database: 'starting',
      secretsManager: { used: true, secretName: 'occasion-admin', fetched: true, validJson: true, settingsReadFromSecret: ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET', 'PAGE_PUBLIC_BASE_URL'] },
      settings: {
        DB_HOST: 'set (from the secret)',
        DB_PORT: 'not set (optional, 5432 is used)',
        DB_NAME: 'set (from the secret)',
        DB_USER: 'set (from the secret)',
        DB_PASSWORD: 'set (from the secret)',
        JWT_SECRET: 'set (from the secret)',
        PAGE_PUBLIC_BASE_URL: 'set (from the secret)',
        S3_BUCKET: 'not set (optional, image upload is disabled until it is set)',
        ADMIN_FRONTEND_ORIGIN: 'set (from the environment)',
      },
      allRequiredSettingsPresent: true,
      errors: [],
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(encodeURIComponent(PASSWORD));
    expect(text).not.toContain(JWT);
  });

  it('says which settings are missing or still placeholders', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', AWS_SECRET_NAME: 'occasion-admin' };
    applySecret({ DB_HOST: 'db.internal', DB_USER: '<database-user>', DB_PASSWORD: PASSWORD }, env);
    const body = healthPayload({ ...newStartupReport(), configurationError: 'Database configuration is incomplete. Missing: DB_NAME' }, env);
    expect(body.settings).toMatchObject({ DB_NAME: 'MISSING', DB_USER: 'PLACEHOLDER, not a real value (from the secret)', JWT_SECRET: 'MISSING', PAGE_PUBLIC_BASE_URL: 'MISSING' });
    expect(body.allRequiredSettingsPresent).toBe(false);
    expect(body.database).toBe('not_configured');
    expect(body.errors).toEqual(['Configuration: Database configuration is incomplete. Missing: DB_NAME']);
  });

  it('shows why the secret could not be read', () => {
    const report = { ...newStartupReport(), secretsManager: { used: true, secretName: 'occasion-admin', fetched: false, validJson: null, keysRead: [], error: 'Could not read secret "occasion-admin" from AWS Secrets Manager: AccessDeniedException' } };
    const body = healthPayload(report, { AWS_SECRET_NAME: 'occasion-admin' });
    expect(body.secretsManager).toMatchObject({ fetched: false });
    expect(body.database).toBe('not_configured');
    expect(body.errors).toEqual(['Secrets Manager: Could not read secret "occasion-admin" from AWS Secrets Manager: AccessDeniedException']);
  });

  it('shows the database error with the password removed, and only until the service is ready', () => {
    const env = deployedEnv();
    const report = newStartupReport();
    report.databaseError = `Database migration failed: Error: P1000: Authentication failed for postgresql://occasion:${encodeURIComponent(PASSWORD)}@db.abc.ap-south-1.rds.amazonaws.com:5432/occasion-admin (password ${PASSWORD})`;
    const failing = healthPayload(report, env);
    expect(failing).toMatchObject({ database: 'unavailable', reason: 'wrong_user_or_password (P1000)', databaseTarget: { host: 'db.abc.ap-south-1.rds.amazonaws.com', database: 'occasion-admin', user: 'occasion', tls: true } });
    expect(failing.errors[0]).toContain('P1000: Authentication failed');
    expect(failing.fix).toContain('Check DB_USER and DB_PASSWORD');
    expect(JSON.stringify(failing)).not.toContain(PASSWORD);
    expect(JSON.stringify(failing)).not.toContain(encodeURIComponent(PASSWORD));

    report.ready = true;
    const ready = healthPayload(report, env);
    expect(ready).toMatchObject({ database: 'ready', errors: [], allRequiredSettingsPresent: true });
    expect(ready).not.toHaveProperty('databaseTarget'); // connection details are for fixing a start-up problem only
    expect(ready).not.toHaveProperty('reason');
  });

  it('says exactly what to grant when the user may not create tables', () => {
    const report = newStartupReport();
    report.databaseError = 'Database migration failed: Error: ERROR: permission denied for schema public';
    const body = healthPayload(report, deployedEnv());
    expect(body.reason).toBe('permission_denied');
    expect(body.fix).toContain('GRANT USAGE, CREATE ON SCHEMA public TO "occasion";');
  });

  it('keeps the panel ready when only the view for gyftr.com could not be created, and says what to grant', () => {
    const report = { ...newStartupReport(), ready: true, integrationViewError: 'ERROR: permission denied for database occasion-admin' };
    const body = healthPayload(report, deployedEnv());
    expect(body).toMatchObject({ database: 'ready', integrationView: 'unavailable', errors: [] });
    expect(body.warnings.join(' ')).toContain('GRANT CREATE ON DATABASE "occasion-admin" TO "occasion";');
    expect(healthPayload({ ...newStartupReport(), ready: true }, deployedEnv()).integrationView).toBe('ready');
  });

  it('removes credentials from any error text', () => {
    const env = deployedEnv();
    expect(redact(`cannot connect to postgres://admin:hunter2pass@10.0.0.5/db with ${JWT}`, env)).toBe('cannot connect to postgres://admin:***@10.0.0.5/db with ***');
  });
});

describe('before the application can start', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

  it('answers the health check, and gives the panel a readable reply with CORS headers', async () => {
    const report = newStartupReport();
    report.secretsManager = { used: true, secretName: 'occasion-admin', fetched: false, validJson: null, keysRead: [], error: 'Could not read secret "occasion-admin" from AWS Secrets Manager: timeout' };
    server = createServer(startingHandler(report, { ADMIN_FRONTEND_ORIGIN: panel, AWS_SECRET_NAME: 'occasion-admin' })).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const url = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${url}/healthz`);
    expect(health.status).toBe(200); // the container health check passes, so the service stays up and keeps trying
    expect(await health.json()).toMatchObject({ status: 'ok', database: 'not_configured', secretsManager: { fetched: false }, errors: [expect.stringContaining('Secrets Manager: Could not read secret')] });

    const preflight = await fetch(`${url}/api/v1/auth/login`, { method: 'OPTIONS', headers: { Origin: panel, 'Access-Control-Request-Method': 'POST' } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(panel);

    const login = await fetch(`${url}/api/v1/auth/login`, { method: 'POST', headers: { Origin: panel, 'content-type': 'application/json' }, body: '{}' });
    expect(login.status).toBe(503);
    expect(login.headers.get('access-control-allow-origin')).toBe(panel);
    expect(((await login.json()) as { error: { code: string } }).error.code).toBe('STARTING');

    const stranger = await fetch(`${url}/api/v1/auth/me`, { headers: { Origin: 'https://evil.example' } });
    expect(stranger.headers.get('access-control-allow-origin')).toBeNull();
  });
});
