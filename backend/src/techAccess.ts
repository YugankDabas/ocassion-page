import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { poolConfig } from './db';

/**
 * Read access for the gyftr.com tech team.
 *
 * Their backend connects to this database (not to the admin panel) with its own login and reads
 * the published pages straight from the tables (docs/INTEGRATION_DATABASE.md).
 *
 * The login is set up by the SQL script prisma/tech_reader.sql, which this module runs at
 * start-up. Its password is the setting TECH_READER_PASSWORD. Creating the login needs a
 * special database right once; after that, running the script changes nothing and needs none.
 */
export const TECH_READER = 'tech_reader';

const SCRIPT = path.resolve('prisma', 'tech_reader.sql');
const WARNING_PREFIX = 'tech_reader: ';

/**
 * The form PostgreSQL stores a password in (SCRAM-SHA-256). Sending this instead of the password
 * itself means the plain password never reaches the database server or its logs.
 */
export function scramVerifier(password: string, salt = randomBytes(16), iterations = 4096): string {
  const salted = pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

/** Whether the login accepts this password: true, false, or the reason it could not be checked. */
async function acceptsPassword(config: pg.ClientConfig, login: string, password: string): Promise<boolean | string> {
  const client = new pg.Client({ ...config, user: login, password });
  try {
    await client.connect();
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === '28P01') return false; // wrong password
    return err instanceof Error ? err.message : String(err);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Runs prisma/tech_reader.sql. With a password: creates the login if it is missing and changes its
 * password if it is not the configured one. In every case a login that exists gets exactly its
 * read rights and limits. Returns what could not be applied (shown on /healthz); throws when the
 * login could not be set up at all.
 */
export async function ensureTechReader(databaseUrl: string, password: string | undefined, login = TECH_READER): Promise<{ warnings: string[] }> {
  const sql = await readFile(SCRIPT, 'utf8');
  const { max: _max, idleTimeoutMillis: _idle, ...config } = poolConfig(databaseUrl);
  const client = new pg.Client(config);
  const warnings: string[] = [];
  client.on('notice', (notice) => {
    if (notice.severity === 'WARNING' && notice.message?.startsWith(WARNING_PREFIX)) warnings.push(notice.message.slice(WARNING_PREFIX.length));
  });
  await client.connect();
  try {
    // The password is sent only when it has to be set: for a new login, or when the login does not accept it.
    let setPassword = false;
    if (password) {
      const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [login]);
      const accepted = existing.rowCount ? await acceptsPassword(config, login, password) : false;
      setPassword = accepted === false;
      if (typeof accepted === 'string') warnings.push(`the password of login "${login}" was not checked: ${accepted}`);
    }
    await client.query('BEGIN');
    await client.query(`SELECT set_config('occasion.tech_reader_login', $1, true), set_config('occasion.tech_reader_verifier', $2, true)`, [login, setPassword ? scramVerifier(password!) : '']);
    await client.query(sql);
    await client.query('COMMIT');
    return { warnings };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end().catch(() => undefined);
  }
}
