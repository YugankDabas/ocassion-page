import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Applies pending Prisma migrations (`prisma migrate deploy`) with the given
 * connection. Idempotent, and safe when several containers start together:
 * Prisma serialises migrations with an advisory lock. Runs without blocking the
 * server, and rejects with Prisma's own message if a migration fails.
 */
export async function runMigrations(databaseUrl: string): Promise<string> {
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  try {
    const { stdout } = await run(process.execPath, [prismaCli, 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: databaseUrl }, maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim().split('\n').pop() ?? '';
  } catch (err) {
    const { stderr = '', stdout = '', message } = err as { stderr?: string; stdout?: string; message: string };
    throw new Error(`Database migration failed: ${(stderr || stdout || message).trim().slice(-1500)}`);
  }
}
