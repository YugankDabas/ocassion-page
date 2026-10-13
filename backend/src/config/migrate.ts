import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function prisma(args: string[], databaseUrl: string): Promise<string> {
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  try {
    const { stdout } = await run(process.execPath, [prismaCli, ...args], { env: { ...process.env, DATABASE_URL: databaseUrl }, maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim();
  } catch (err) {
    const { stderr = '', stdout = '', message } = err as { stderr?: string; stdout?: string; message: string };
    throw new Error((stderr || stdout || message).trim().slice(-1500));
  }
}

const lastLine = (output: string) => output.split('\n').pop() ?? '';

/**
 * Applies pending Prisma migrations (`prisma migrate deploy`) with the given
 * connection. Idempotent, and safe when several containers start together:
 * Prisma serialises migrations with an advisory lock. Runs without blocking the
 * server, and rejects with Prisma's own message if a migration fails.
 *
 * Recovers by itself from an earlier failed attempt. When a migration fails
 * (typically because the database user lacked a permission), Prisma records it
 * as failed and refuses every later run (P3009) even after the cause is fixed,
 * until someone runs `prisma migrate resolve` by hand. PostgreSQL applies a
 * migration file as one transaction, so a failed one leaves nothing behind:
 * it is marked as rolled back here and applied again.
 */
export async function runMigrations(databaseUrl: string): Promise<string> {
  try {
    return lastLine(await prisma(['migrate', 'deploy'], databaseUrl));
  } catch (err) {
    const message = (err as Error).message;
    const failed = [...message.matchAll(/The `([0-9A-Za-z_]+)` migration started at .* failed/g)].map((m) => m[1]!);
    if (!/P3009/.test(message) || failed.length === 0) throw new Error(`Database migration failed: ${message}`);
    try {
      for (const name of failed) await prisma(['migrate', 'resolve', '--rolled-back', name], databaseUrl);
      return `${lastLine(await prisma(['migrate', 'deploy'], databaseUrl))} (after retrying ${failed.join(', ')}, which had failed earlier)`;
    } catch (retryErr) {
      throw new Error(`Database migration failed: ${(retryErr as Error).message}`);
    }
  }
}
