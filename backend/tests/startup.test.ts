import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { applyDatabaseUrl } from '../src/config/database';
import { applySecret } from '../src/config/secrets';
import { healthPayload, newStartupReport, redact, startingHandler } from '../src/startup';

const PASSWORD = 'S3cr3t/Pass:word@1';
const JWT = 'j'.repeat(48);
const panel = 'https://occasion-admin.gyftr.net';
const fetched = { used: true, secretName: 'occasion-admin', fetched: true, validJson: true, keysRead: [], error: null };

/** An environment as it is on ECS after the secret was read. */
function deployedEnv(secret: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', AWS_SECRET_NAME: 'occasion-admin', ADMIN_FRONTEND_ORIGIN: panel };
  applySecret({ DB_HOST: 'db.abc.ap-south-1.rds.amazonaws.com', DB_NAME: 'occasion-admin', DB_USER: 'occasion', DB_PASSWORD: PASSWORD, JWT_SECRET: JWT, PAGE_PUBLIC_BASE_URL: 'https://www.gyftr.com/occasion', S3_BUCKET: '', ...secret }, env);
  applyDatabaseUrl(env);
  return env;
}

describe('GET /healthz', () => {
  it('has five fields and nothing else when everything is fine', () => {
    const body = healthPayload({ ...newStartupReport(), ready: true, secretsManager: fetched }, deployedEnv());
    expect(body).toEqual({
      status: 'ok',
      database: 'ready',
      builtAt: 'development',
      secrets: { source: 'AWS Secrets Manager', fetched: true, missing: [] },
      errors: [],
    });
  });

  it('never contains a value, a host name or a user name', () => {
    const env = deployedEnv();
    const report = { ...newStartupReport(), secretsManager: fetched, databaseError: 'timeout expired' };
    const text = JSON.stringify(healthPayload(report, env));
    for (const secretValue of [PASSWORD, encodeURIComponent(PASSWORD), JWT, 'db.abc.ap-south-1.rds.amazonaws.com']) expect(text).not.toContain(secretValue);
  });

  it('names the required settings that are missing or still placeholders', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', AWS_SECRET_NAME: 'occasion-admin' };
    applySecret({ DB_HOST: 'db.internal', DB_USER: '<database-user>', DB_PASSWORD: PASSWORD }, env);
    const body = healthPayload({ ...newStartupReport(), secretsManager: fetched, configurationError: 'Database configuration is incomplete. Missing: DB_NAME' }, env);
    expect(body.secrets).toEqual({ source: 'AWS Secrets Manager', fetched: true, missing: ['DB_NAME', 'DB_USER', 'JWT_SECRET', 'PAGE_PUBLIC_BASE_URL'] });
    expect(body.database).toBe('not_configured');
    expect(body.errors).toEqual(['Configuration: Database configuration is incomplete. Missing: DB_NAME']);
  });

  it('shows why the secret could not be read', () => {
    const report = { ...newStartupReport(), secretsManager: { ...fetched, fetched: false, validJson: null, error: 'Could not read secret "occasion-admin" from AWS Secrets Manager: AccessDeniedException' } };
    const body = healthPayload(report, { AWS_SECRET_NAME: 'occasion-admin' });
    expect(body.secrets.fetched).toBe(false);
    expect(body.database).toBe('not_configured');
    expect(body.errors).toEqual(['Secrets Manager: Could not read secret "occasion-admin" from AWS Secrets Manager: AccessDeniedException']);
  });

  it('says so when the secret is not valid JSON, even though it could be read', () => {
    const body = healthPayload({ ...newStartupReport(), ready: true, secretsManager: { ...fetched, validJson: false } }, deployedEnv());
    expect(body.errors).toEqual(['Secrets Manager: the secret is not valid JSON (it was still read). Put every value in double quotes.']);
  });

  it('shows a database error with the password removed and what to do about it', () => {
    const env = deployedEnv();
    const report = { ...newStartupReport(), secretsManager: fetched };
    report.databaseError = `password authentication failed for postgresql://occasion:${encodeURIComponent(PASSWORD)}@db.internal:5432/occasion-admin (password ${PASSWORD})`;
    const failing = healthPayload(report, env);
    expect(failing.database).toBe('unavailable');
    expect(failing.errors).toEqual(['Database: password authentication failed for postgresql://occasion:***@db.internal:5432/occasion-admin (password ***) | Fix: check DB_USER and DB_PASSWORD in the secret (a corrected secret is picked up within 15 seconds).']);

    report.databaseError = 'timeout expired';
    expect(healthPayload(report, env).errors[0]).toBe('Database: timeout expired | Fix: allow PostgreSQL (port 5432) from the backend ECS tasks in the RDS security group, and check DB_HOST and DB_PORT.');

    report.databaseError = 'Database migration 20261011120000_init failed: permission denied for schema public';
    expect(healthPayload(report, env).errors[0]).toContain('GRANT USAGE, CREATE ON SCHEMA public TO "occasion";');

    report.ready = true; // the error is history once the service is running
    expect(healthPayload(report, env).errors).toEqual([]);
  });

  it('lists settings that are wrong without stopping the service', () => {
    const report = { ...newStartupReport(), ready: true, secretsManager: fetched, warnings: ['S3_BUCKET is not set: image upload is disabled until it is'] };
    expect(healthPayload(report, deployedEnv())).toMatchObject({ database: 'ready', errors: ['S3_BUCKET is not set: image upload is disabled until it is'] });
  });

  it('says what to run when the tech login cannot be created, without stopping the panel', () => {
    const env = deployedEnv({ TECH_READER_PASSWORD: 'tech-reader-password-123456' });
    const report = { ...newStartupReport(), ready: true, secretsManager: fetched, techReaderError: 'permission denied to create role' };
    const body = healthPayload(report, env);
    expect(body.database).toBe('ready');
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toContain('Tech login: permission denied to create role | Fix: the panel\'s database user may not create logins.');
    expect(body.errors[0]).toContain('ALTER ROLE "occasion" CREATEROLE;');
    expect(body.errors[0]).toContain('ALTER ROLE "occasion" NOCREATEROLE;'); // the right is only needed once
    const later = healthPayload({ ...report, techReaderError: 'the password of login "occasion_tech_reader" is not the configured one, and this database user may not change it' }, env);
    expect(later.errors[0]).toMatch(/^Tech login: the password .* may not change it \| Fix: see "How the login is created" in docs\/INTEGRATION_DATABASE\.md\.$/);
    expect(JSON.stringify(healthPayload({ ...report, techReaderError: 'bad tech-reader-password-123456' }, env))).not.toContain('tech-reader-password-123456');
  });

  it('on a developer machine reports the environment as the source', () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: 'postgresql://postgres:x@localhost:5432/occasion_admin', JWT_SECRET: JWT, PAGE_PUBLIC_BASE_URL: 'https://www.gyftr.com/occasion' };
    expect(healthPayload({ ...newStartupReport(), ready: true }, env).secrets).toEqual({ source: 'environment', missing: [] });
  });

  it('removes credentials from any error text', () => {
    expect(redact(`cannot connect to postgres://admin:hunter2pass@10.0.0.5/db with ${JWT}`, deployedEnv())).toBe('cannot connect to postgres://admin:***@10.0.0.5/db with ***');
  });
});

describe('before the application can start', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

  it('answers the health check, and gives the panel a readable reply with CORS headers', async () => {
    const report = newStartupReport();
    report.secretsManager = { ...fetched, fetched: false, validJson: null, error: 'Could not read secret "occasion-admin" from AWS Secrets Manager: timeout' };
    server = createServer(startingHandler(report, { ADMIN_FRONTEND_ORIGIN: panel, AWS_SECRET_NAME: 'occasion-admin' })).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const url = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${url}/healthz`);
    expect(health.status).toBe(200); // the container health check passes, so the service stays up and keeps trying
    expect(await health.json()).toMatchObject({ status: 'ok', database: 'not_configured', secrets: { fetched: false }, errors: [expect.stringContaining('Secrets Manager: Could not read secret')] });

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
