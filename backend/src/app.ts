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
import { healthPayload, readyReport, type StartupReport } from './startup';
import { LocalDiskStorage, S3Storage } from './storage/StorageProvider';

export function createApp(c: Container, startup: StartupReport = readyReport()): Express {
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
    // Whether the secret was read, which settings were found (names only) and, until the service is ready, what is wrong.
    res.set('Cache-Control', 'no-store').json(healthPayload(startup));
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

  // Uploaded images read from the bucket by this API, for a bucket that may not be read publicly
  // (MEDIA_BASE_URL = this API's /media). Public, like the images themselves; only the panel's own
  // folder can be read through it, and only images.
  if (c.storage instanceof S3Storage) {
    const storage = c.storage;
    app.use('/media', async (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      try {
        const file = await storage.open(decodeURIComponent(req.path.slice(1)));
        if (!file) return res.status(404).set('Cache-Control', 'no-store').end();
        res.set({
          'Content-Type': file.contentType,
          // File names are unique (uuid), so a file never changes.
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
          ...(file.contentLength !== undefined ? { 'Content-Length': String(file.contentLength) } : {}),
          ...(file.etag ? { ETag: file.etag } : {}),
        });
        if (req.method === 'HEAD') {
          file.body.destroy();
          return res.end();
        }
        file.body.on('error', (err) => {
          req.log.error({ err }, 'Reading an image from the bucket failed');
          res.destroy(err);
        });
        file.body.pipe(res);
      } catch (err) {
        req.log.error({ err }, 'Could not read an image from the bucket');
        res.status(502).set('Cache-Control', 'no-store').end();
      }
    });
  }

  // The built admin panel (same origin as the API).
  if (env.SERVE_FRONTEND_DIR) {
    const dir = path.resolve(env.SERVE_FRONTEND_DIR);
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|uploads\/|media\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(dir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
