import { randomUUID } from 'node:crypto';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Container } from './container';
import { errorHandler, notFoundHandler } from './http/middleware';
import { adminRouter } from './http/routes';
import { LocalDiskStorage } from './storage/StorageProvider';

/**
 * Turns a database start-up error into a short, non-sensitive category for /healthz.
 * Only fixed words and Prisma's public error code (P1000…) are returned, never the message itself.
 */
export function databaseFailureReason(message: string): string {
  const code = /\bP\d{4}\b/.exec(message)?.[0];
  const category =
    /template placeholder/i.test(message) ? `placeholder_value_in ${(message.split(': ').pop() ?? '').replace(/[^A-Z_, ]/g, '')}`
    : /P1001|P1002|P1008|Can't reach database server|timed out|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(message) ? 'cannot_reach_database_server'
    : /P1000|authentication failed|password authentication/i.test(message) ? 'wrong_user_or_password'
    : /P1011|\bTLS\b|\bSSL\b|certificate/i.test(message) ? 'tls_error'
    : /P1010|permission denied|must be owner|denied access/i.test(message) ? 'permission_denied'
    : /P1003|database .* does not exist/i.test(message) ? 'database_does_not_exist'
    : /P3009|P3018|failed migrations|migration.*failed to apply/i.test(message) ? 'migration_failed'
    : /Query engine|schema engine|libssl|openssl|ENOENT|EACCES|spawn|Cannot find module/i.test(message) ? 'migration_tool_cannot_run'
    : /Database configuration is incomplete/i.test(message) ? 'database_settings_missing'
    : 'other';
  return code ? `${category} (${code})` : category;
}

/** Whether the database has been prepared (schema, first-run data). Shared with server.ts. */
export interface StartupState {
  ready: boolean;
  /** Why it is not ready yet; logged, never sent to clients. */
  error: string | null;
}

export function createApp(c: Container, startup: StartupState = { ready: true, error: null }): Express {
  const { env, logger } = c;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('etag', false);
  app.use(
    pinoHttp({
      logger,
      // One id per request, so a failing call can be traced in the logs.
      genReqId: () => randomUUID(),
      autoLogging: { ignore: (req) => req.url === '/healthz' },
      // Log the path only: query strings can carry preview tokens.
      serializers: {
        req: (req: { id: unknown; method: string; url: string; remoteAddress?: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
          ip: req.remoteAddress,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );
  // After the request log, so a refused origin leaves a trace.
  app.use((req, res, next) => {
    if (req.path !== '/api/v1' && !req.path.startsWith('/api/v1/')) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    // Allowed: the admin panel, and this API's own origin (when the API itself serves the panel).
    const ownOrigin = `${req.protocol}://${req.get('host')}`;
    if (origin === ownOrigin) return next();
    if (origin !== env.ADMIN_FRONTEND_ORIGIN) {
      // Logged with both values: the usual cause is the panel being opened on another address than the one configured.
      req.log.warn({ origin, allowed: env.ADMIN_FRONTEND_ORIGIN }, 'Request refused: origin is not the admin panel');
      return res.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'This origin is not allowed.' } });
    }
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
      Vary: 'Origin',
    });
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // The admin SPA (when served from here) loads images from the CDN / uploads.
          'img-src': ["'self'", 'data:', 'blob:', 'https:', ...(env.isProduction ? [] : ['http:'])],
          'connect-src': ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // uploads are embedded by pages on gyftr.com
    }),
  );
  app.use(compression());

  // Health check for the load balancer.
  // Answers as soon as the process is up, so the load balancer keeps routing and the panel gets a real reply.
  app.get('/healthz', (_req, res) => {
    if (startup.ready) return res.json({ status: 'ok', database: 'ready' });
    // `reason` is a short category (never the message, host, user or password), so the cause can be seen without log access.
    res.json({ status: 'ok', database: startup.error ? 'unavailable' : 'starting', ...(startup.error ? { reason: databaseFailureReason(startup.error) } : {}) });
  });

  // Admin API. The panel is served from the same origin, so no CORS is enabled.
  app.use(
    '/api/v1',
    (_req, res, next) => {
      if (startup.ready) return next();
      res.status(503).json({ error: { code: 'STARTING', message: 'The service is starting or cannot reach its database yet. Try again in a moment.' } });
    },
    express.json({ limit: '2mb' }),
    express.urlencoded({ extended: false, limit: '2mb' }), // the preview is requested with a form post
    cookieParser(),
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    },
    adminRouter(c),
  );

  // Uploads stored on local disk (development, no S3_BUCKET). Deployed environments use S3.
  if (c.storage instanceof LocalDiskStorage) {
    app.use(
      '/uploads',
      express.static(c.storage.directory, {
        immutable: true,
        maxAge: '365d',
        index: false,
        dotfiles: 'deny',
        setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff'),
      }),
    );
  }

  // The built admin panel (same origin as the API).
  if (env.SERVE_FRONTEND_DIR) {
    const dir = path.resolve(env.SERVE_FRONTEND_DIR);
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
