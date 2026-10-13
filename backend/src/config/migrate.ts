import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { poolConfig } from '../db';

/**
 * Creates / updates the database schema at start-up by running the SQL files in
 * prisma/migrations, in order, each exactly once. Plain SQL over the "pg" driver:
 * no command-line tool and no native binary is involved (the same way the other
 * GyFTR panels apply their schema at boot).
 *
 * - Needs only the right to create tables in schema "public".
 * - Each file runs in one transaction: it is applied completely or not at all.
 * - A file that failed earlier (say, a permission was missing) is simply tried again.
 * - Safe when several containers start together (one applies, the others wait).
 * - What was applied is recorded in "_prisma_migrations", in the format Prisma's own
 *   tool uses, so `prisma migrate` on a developer machine sees the same history.
 */

const MIGRATIONS_DIR = path.resolve('prisma', 'migrations');
/** The lock Prisma's own tool takes, so the two never apply migrations at the same time. */
const LOCK_ID = 72707369;

const HISTORY_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"            VARCHAR(64) NOT NULL,
    "finished_at"         TIMESTAMPTZ,
    "migration_name"      VARCHAR(255) NOT NULL,
    "logs"                TEXT,
    "rolled_back_at"      TIMESTAMPTZ,
    "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

/** Connects; when the database itself does not exist yet, creates it first if this user is allowed to. */
async function connect(config: pg.ClientConfig): Promise<pg.Client> {
  const client = new pg.Client(config);
  try {
    await client.connect();
    return client;
  } catch (err) {
    await client.end().catch(() => undefined);
    if ((err as { code?: string }).code !== '3D000') throw err; // 3D000 = the database does not exist
    const server = new pg.Client({ ...config, database: 'postgres' });
    try {
      await server.connect();
      await server.query(`CREATE DATABASE "${String(config.database).replace(/"/g, '""')}"`);
    } catch (createErr) {
      throw new Error(`database "${String(config.database)}" does not exist and could not be created: ${(createErr as Error).message}`);
    } finally {
      await server.end().catch(() => undefined);
    }
    const retry = new pg.Client(config);
    await retry.connect();
    return retry;
  }
}

export async function runMigrations(databaseUrl: string, dir = MIGRATIONS_DIR): Promise<string> {
  const names = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const { max: _max, idleTimeoutMillis: _idle, ...config } = poolConfig(databaseUrl);
  const client = await connect(config);
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(HISTORY_TABLE);
    const history = await client.query<{ migration_name: string }>(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    );
    const applied = new Set(history.rows.map((row) => row.migration_name));

    const done: string[] = [];
    for (const name of names) {
      if (applied.has(name)) continue;
      const sql = await readFile(path.join(dir, name, 'migration.sql'));
      try {
        await client.query('BEGIN');
        // An earlier attempt that did not finish left nothing behind (one transaction per file): close its record.
        await client.query('UPDATE "_prisma_migrations" SET rolled_back_at = now() WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL', [name]);
        await client.query(sql.toString('utf8'));
        await client.query(
          'INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ($1, $2, $3, now(), now(), 1)',
          [randomUUID(), createHash('sha256').update(sql).digest('hex'), name],
        );
        await client.query('COMMIT');
        done.push(name);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Database migration ${name} failed: ${(err as Error).message}`);
      }
    }
    return done.length ? `Applied ${done.join(', ')}` : 'No pending migrations';
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}
