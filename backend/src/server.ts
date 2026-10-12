import { createApp, type StartupState } from './app';
import { bootstrap } from './bootstrap';
import { configurationProblems, loadEnv } from './config/env';
import { runMigrations } from './config/migrate';
import { loadSecretsIntoEnv } from './config/secrets';
import { createContainer } from './container';
import { createLogger } from './lib/logger';
import { BcryptPasswordHasher } from './services/security';

async function main() {
  await loadSecretsIntoEnv(); // AWS Secrets Manager → process.env (locally: .env only), then DB_* → database URL
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, !env.isProduction);
  for (const problem of configurationProblems(env)) logger.error({ problem }, 'Configuration problem');
  const container = createContainer(env, logger);

  // The server answers at once (health check, and a clear "starting" reply to the panel) while the
  // database is prepared in the background. A database that is not reachable yet, or a user that
  // cannot create tables, is logged and retried instead of stopping the container.
  const startup: StartupState = { ready: false, error: null };
  const app = createApp(container, startup);
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'Occasion admin API listening');
  });

  const prepareDatabase = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        if (env.RUN_MIGRATIONS_ON_START) logger.info({ result: await runMigrations(env.DATABASE_URL) }, 'Database schema is up to date');
        await container.prisma.$connect();
        // New database: occasions, default site settings and the first administrator. Does nothing afterwards.
        await bootstrap(container.prisma, env.PAGE_PUBLIC_BASE_URL, new BcryptPasswordHasher(), logger);
        startup.ready = true;
        startup.error = null;
        logger.info('Database ready');
        // Catch up on anything a previous container did not finish (a re-render interrupted by a deploy).
        // Costs nothing when the stored HTML is already current.
        container.services.publications.refreshAll().catch((err: unknown) => logger.error({ err }, 'Start-up re-render failed'));
        return;
      } catch (err) {
        startup.error = err instanceof Error ? err.message : String(err);
        logger.error({ err, attempt }, 'Database is not ready; retrying in 15 seconds');
        await new Promise((resolve) => setTimeout(resolve, 15_000));
      }
    }
  };
  void prepareDatabase();

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
