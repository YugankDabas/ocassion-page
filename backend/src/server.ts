import { createApp } from './app';
import { loadEnv } from './config/env';
import { runMigrations } from './config/migrate';
import { loadSecretsIntoEnv } from './config/secrets';
import { createContainer } from './container';
import { createLogger } from './lib/logger';

async function main() {
  await loadSecretsIntoEnv(); // AWS Secrets Manager → process.env (locally: .env only), then DB_* → database URL
  const env = loadEnv();
  if (env.RUN_MIGRATIONS_ON_START) runMigrations(env.DATABASE_URL);
  const logger = createLogger(env.LOG_LEVEL, !env.isProduction);
  const container = createContainer(env, logger);
  await container.prisma.$connect();

  const app = createApp(container);
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Occasion admin API listening');
  });
  // Catch up on anything a previous container did not finish (a re-render interrupted by a deploy).
  // Costs nothing when the stored HTML is already current.
  container.services.publications.refreshAll().catch((err: unknown) => logger.error({ err }, 'Start-up re-render failed'));

  server.keepAliveTimeout = 65_000; // longer than typical LB idle timeouts
  server.headersTimeout = 66_000;

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    server.close(async () => {
      await container.prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
