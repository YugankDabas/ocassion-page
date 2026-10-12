import { describe, expect, it, vi } from 'vitest';
import { applyDatabaseUrl } from '../src/config/database';
import { loadEnv } from '../src/config/env';
import { applySecret, loadSecretsIntoEnv } from '../src/config/secrets';

const secretsManager = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    send = secretsManager.send;
  },
  GetSecretValueCommand: class {
    constructor(readonly input: { SecretId: string }) {}
  },
}));

const base = { JWT_SECRET: 'x'.repeat(40), PAGE_PUBLIC_BASE_URL: 'https://www.gyftr.com/occasion' };

describe('database settings', () => {
  it('builds the connection from separate fields, with TLS and a capped pool', () => {
    const env: NodeJS.ProcessEnv = { DB_HOST: 'db.abc.ap-south-1.rds.amazonaws.com', DB_NAME: 'occasion_admin', DB_USER: 'occasion', DB_PASSWORD: 'secret' };
    applyDatabaseUrl(env);
    expect(env.DATABASE_URL).toBe('postgresql://occasion:secret@db.abc.ap-south-1.rds.amazonaws.com:5432/occasion_admin?sslmode=require&connection_limit=10&pool_timeout=10');
  });

  it('accepts any letter case for the names, trims values and honours DB_PORT', () => {
    const env: NodeJS.ProcessEnv = { db_host: ' 10.0.0.5 ', Db_Port: '6432', DB_Name: 'occasion_admin', db_user: 'occasion', Db_Password: 'secret' };
    applyDatabaseUrl(env);
    expect(env.DATABASE_URL).toBe('postgresql://occasion:secret@10.0.0.5:6432/occasion_admin?sslmode=require&connection_limit=10&pool_timeout=10');
  });

  it('keeps special characters in the password intact', () => {
    const password = 'p@ss:w/rd?#&% +é';
    const env: NodeJS.ProcessEnv = { DB_HOST: 'localhost', DB_NAME: 'occasion_admin', DB_USER: 'postgres', DB_PASSWORD: password };
    applyDatabaseUrl(env);
    const url = new URL(env.DATABASE_URL!);
    expect(decodeURIComponent(url.password)).toBe(password);
    expect(url.hostname).toBe('localhost');
    expect(url.searchParams.get('sslmode')).toBeNull(); // a local database has no TLS
  });

  it('names the missing fields and rejects a malformed host or port', () => {
    expect(() => applyDatabaseUrl({ DB_HOST: 'h', DB_USER: 'u' })).toThrow('Missing: DB_NAME, DB_PASSWORD');
    const ok = { DB_NAME: 'n', DB_USER: 'u', DB_PASSWORD: 'p' };
    expect(() => applyDatabaseUrl({ ...ok, DB_HOST: 'postgresql://h:5432/x' })).toThrow('DB_HOST');
    expect(() => applyDatabaseUrl({ ...ok, DB_HOST: 'h', DB_PORT: 'abc' })).toThrow('DB_PORT');
  });

  it('uses a DATABASE_URL that is already given (local development)', () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: 'postgresql://postgres:x@localhost:5432/occasion_admin', DB_HOST: 'ignored' };
    applyDatabaseUrl(env);
    expect(env.DATABASE_URL).toBe('postgresql://postgres:x@localhost:5432/occasion_admin');
  });
});

describe('Secrets Manager secret', () => {
  it('copies known settings whatever their case, ignores unknown keys and never overrides the environment', () => {
    const env: NodeJS.ProcessEnv = { PORT: '4000' };
    applySecret({ db_host: 'db.internal', Db_Name: 'occasion_admin', DB_USER: 'occasion', db_password: 'secret', jwt_secret: 'y'.repeat(40), s3_bucket: 'gyftr-occasion-media', port: 5432, host: 'not-ours', engine: 'postgres', nested: { a: 1 }, PAGE_PUBLIC_BASE_URL: ' ' }, env);
    expect(env).toEqual({ PORT: '4000', DB_HOST: 'db.internal', DB_NAME: 'occasion_admin', DB_USER: 'occasion', DB_PASSWORD: 'secret', JWT_SECRET: 'y'.repeat(40), S3_BUCKET: 'gyftr-occasion-media' });
  });
  it('a deployed start-up needs only AWS_SECRET_NAME: every setting comes from the secret', async () => {
    secretsManager.send.mockResolvedValueOnce({
      SecretString: JSON.stringify({ db_host: 'db.internal', db_name: 'occasion_admin', db_user: 'occasion', db_password: 'p@ss', jwt_secret: 'z'.repeat(40), page_public_base_url: 'https://www.gyftr.com/occasion', s3_bucket: 'gyftr-occasion-media' }),
    });
    const env: NodeJS.ProcessEnv = { AWS_SECRET_NAME: 'occasion-admin/staging', AWS_REGION: 'ap-south-1', NODE_ENV: 'production' };
    await loadSecretsIntoEnv(env);
    expect(secretsManager.send.mock.calls[0]![0]).toMatchObject({ input: { SecretId: 'occasion-admin/staging' } });
    const settings = loadEnv(env);
    expect(settings).toMatchObject({ S3_BUCKET: 'gyftr-occasion-media', PAGE_PUBLIC_BASE_URL: 'https://www.gyftr.com/occasion', isProduction: true });
    expect(settings.DATABASE_URL).toBe('postgresql://occasion:p%40ss@db.internal:5432/occasion_admin?sslmode=require&connection_limit=10&pool_timeout=10');
  });

  it('stops the start-up with a clear message when the secret cannot be read', async () => {
    secretsManager.send.mockRejectedValue(new Error('AccessDenied'));
    await expect(loadSecretsIntoEnv({ AWS_SECRET_NAME: 'occasion-admin/staging' }, 1)).rejects.toThrow('Could not read secret "occasion-admin/staging" from AWS Secrets Manager: AccessDenied');
  });
});

describe('storage settings', () => {
  it('needs only the bucket name; the region defaults to ap-south-1', () => {
    const env = loadEnv({ ...base, NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@h:5432/d', S3_BUCKET: 'gyftr-occasion-media' });
    expect(env).toMatchObject({ S3_BUCKET: 'gyftr-occasion-media', AWS_REGION: 'ap-south-1', S3_PREFIX: 'occasion-pages' });
  });

  it('refuses to run in production without a bucket, and rejects a malformed bucket name', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@h:5432/d' })).toThrow('S3_BUCKET is required');
    expect(() => loadEnv({ ...base, DATABASE_URL: 'postgresql://u:p@h:5432/d', S3_BUCKET: 's3://My.Bucket' })).toThrow('bucket name');
  });

  it('falls back to local disk in development', () => {
    const env = loadEnv({ ...base, DATABASE_URL: 'postgresql://u:p@localhost:5432/d', PUBLIC_UPLOADS_BASE_URL: 'http://localhost:4000/uploads' });
    expect(env.S3_BUCKET).toBeUndefined();
  });

  it('says which database fields to set when none are given', () => {
    expect(() => loadEnv({ ...base, PUBLIC_UPLOADS_BASE_URL: 'http://localhost:4000/uploads' })).toThrow('DB_HOST, DB_NAME, DB_USER and DB_PASSWORD');
  });
});
