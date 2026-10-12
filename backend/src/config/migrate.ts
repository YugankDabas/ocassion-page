import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

/**
 * Applies pending Prisma migrations (`prisma migrate deploy`) with the given
 * connection. Idempotent, and safe when several containers start together:
 * Prisma serialises migrations with an advisory lock.
 * Throws — and so stops the start-up — if a migration fails.
 */
export function runMigrations(databaseUrl: string): void {
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: databaseUrl } });
}
