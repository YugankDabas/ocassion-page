import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { PoolConfig } from 'pg';

/**
 * The database connection.
 *
 * Queries go through the plain "pg" driver, the same one the other GyFTR panels use, with Prisma on
 * top for typed queries. There is no native database engine and no command-line tool involved at
 * run time, so the application needs nothing from the container image beyond Node itself.
 */

const ON_THIS_MACHINE = new Set(['localhost', '127.0.0.1', '::1']);

/** "pg" settings for a postgresql:// URL. */
export function poolConfig(databaseUrl: string): PoolConfig {
  const url = new URL(databaseUrl);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const sslmode = url.searchParams.get('sslmode');
  return {
    host,
    port: Number(url.port) || 5432,
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    // RDS requires TLS. Its certificate is signed by Amazon's own RDS root, which Node does not ship, so the
    // connection is encrypted without checking the chain (as in the other GyFTR panels). Only a database on
    // this machine goes without TLS.
    ssl: sslmode === 'disable' || (!sslmode && ON_THIS_MACHINE.has(host)) ? false : { rejectUnauthorized: false },
    max: Number(url.searchParams.get('connection_limit')) || 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  };
}

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg(poolConfig(databaseUrl)) });
}
