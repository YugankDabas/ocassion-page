import { createServer, type RequestListener } from 'node:http';
import { createApp } from './app';
import { bootstrap } from './bootstrap';
import { applyDatabaseUrl, describeDatabaseTarget, placeholderDatabaseSettings } from './config/database';
import { configurationProblems, loadEnv } from './config/env';
import { runMigrations } from './config/migrate';
import { fetchSecret } from './config/secrets';
import { createContainer, type Container } from './container';
import { ensureIntegrationView } from './integrationView';
import { createLogger } from './lib/logger';
import { BcryptPasswordHasher } from './services/security';
import { BUILT_AT, newStartupReport, startingHandler } from './startup';

const RETRY_MS = 15_000;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

function main() {
  const report = newStartupReport();
  const logger = createLogger(LOG_LEVELS.includes(process.env.LOG_LEVEL ?? '') ? process.env.LOG_LEVEL! : 'info', process.env.NODE_ENV !== 'production');
  let container: Container | null = null;

  // The server answers from the first moment, whatever happens next: GET /healthz says whether the
  // secret was read, which settings were found and what is wrong, and the panel gets a readable
  // "starting" reply. Once the settings are loaded the application itself takes over.
  let handler: RequestListener = startingHandler(report);
  const server = createServer((req, res) => handler(req, res));
  server.keepAliveTimeout = 65_000; // longer than typical LB idle timeouts
  server.headersTimeout = 66_000;
  const port = Number(process.env.PORT) || 4000;
  server.listen(port, () => logger.info({ port, builtAt: BUILT_AT }, 'Occasion admin API listening'));

  /**
   * Secret → settings → database, repeated every 15 seconds until all three succeed. Nothing here
   * stops the container: a secret that cannot be read, a missing setting, a database that is not
   * reachable or a user without rights is logged, reported on /healthz and tried again, so fixing
   * the cause in AWS is enough (the secret is read again on every attempt).
   */
  /**
   * The view the gyftr.com backend reads. It needs a database-level right the panel does not otherwise
   * need, so a failure here is reported on /healthz and tried again every minute; it never keeps the panel down.
   */
  const ensureView = async (c: Container): Promise<void> => {
    try {
      await ensureIntegrationView(c.prisma);
      if (report.integrationViewError) logger.info('Integration view created');
      report.integrationViewError = null;
    } catch (err) {
      report.integrationViewError = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Could not create the view integration.published_pages; retrying in a minute');
      setTimeout(() => void ensureView(c), 60_000).unref();
    }
  };

  const start = async () => {
    let appliedSettings = '';
    for (let attempt = 1; ; attempt++) {
      report.attempts = attempt;
      report.lastAttemptAt = new Date().toISOString();
      let stage: 'secrets' | 'configuration' | 'database' = 'secrets';
      try {
        report.secretsManager = await fetchSecret(); // AWS Secrets Manager → process.env (locally: .env only)
        if (report.secretsManager.error) throw new Error(report.secretsManager.error);

        stage = 'configuration';
        applyDatabaseUrl(); // DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD → connection URL
        const env = loadEnv();
        report.configurationError = null;
        report.warnings = configurationProblems(env);
        if (!container || JSON.stringify(env) !== appliedSettings) {
          // First time, or the settings changed since the last attempt (a corrected secret): build the application with them.
          await container?.prisma.$disconnect().catch(() => undefined);
          logger.level = env.LOG_LEVEL;
          container = createContainer(env, logger);
          handler = createApp(container, report);
          appliedSettings = JSON.stringify(env);
          // Host, database and user (never the password), so the log shows what is actually being connected to.
          logger.info({ database: describeDatabaseTarget(env.DATABASE_URL), settingsReadFromSecret: report.secretsManager.keysRead }, 'Settings loaded');
          for (const problem of report.warnings) logger.error({ problem }, 'Configuration problem');
          if (env.PORT !== port) logger.warn({ listening: port, configured: env.PORT }, 'PORT must be set in the task environment, not only in the secret');
        }

        stage = 'database';
        const placeholders = placeholderDatabaseSettings();
        if (placeholders.length) throw new Error(`Database settings still contain a template placeholder instead of a real value: ${placeholders.join(', ')}`);
        if (env.RUN_MIGRATIONS_ON_START) logger.info({ result: await runMigrations(env.DATABASE_URL) }, 'Database schema is up to date');
        await container.prisma.$connect();
        // New database: occasions, default site settings and the first administrator. Does nothing afterwards.
        await bootstrap(container.prisma, env.PAGE_PUBLIC_BASE_URL, new BcryptPasswordHasher(), logger);
        await ensureView(container);
        report.databaseError = null;
        report.ready = true;
        logger.info('Database ready');
        // Catch up on anything a previous container did not finish (a re-render interrupted by a deploy).
        // Costs nothing when the stored HTML is already current.
        container.services.publications.refreshAll().catch((err: unknown) => logger.error({ err }, 'Start-up re-render failed'));
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (stage === 'configuration') report.configurationError = message;
        else if (stage === 'database') report.databaseError = message;
        logger.error({ err, attempt, stage }, 'Start-up is not complete; retrying in 15 seconds');
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }
    }
  };
  void start();

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    server.close(async () => {
      await container?.prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));
}

main();
