import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { can, type Permission, type SessionUser } from '../contracts';
import { safeEqual } from '../lib/crypto';
import { AppError, ForbiddenError, PayloadTooLargeError, UnauthorizedError, ValidationError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { Actor } from '../services/AuditService';
import type { AuthService } from '../services/AuthService';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
  }
}

export const SESSION_COOKIE = 'occ_session';
export const CSRF_COOKIE = 'occ_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Parse + validate untrusted input. Throws a 422 with field-level details. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError('Request validation failed', result.error.flatten());
  return result.data;
}

export function actorOf(req: Request): Actor {
  if (!req.user) throw new UnauthorizedError();
  return { id: req.user.id, ip: req.ip ?? null };
}

export function authenticate(auth: AuthService): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || !token) return next(new UnauthorizedError());
    req.user = await auth.authenticate(token);
    next();
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!can(req.user.role, permission)) return next(new ForbiddenError());
    next();
  };
}

/**
 * Double-submit CSRF check for cookie-authenticated, state-changing requests.
 * The token lives in an httpOnly cookie and is handed to the SPA in the
 * login / session response body; a cross-site page can neither read it nor
 * set the header, so forged requests fail.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookie: unknown = req.cookies?.[CSRF_COOKIE];
  // Header for API calls; a form field for the one form post (the preview, which loads into an iframe).
  const formField: unknown = (req.body as { _csrf?: unknown } | undefined)?._csrf;
  const token = req.get(CSRF_HEADER) ?? (typeof formField === 'string' ? formField : undefined);
  if (typeof cookie !== 'string' || !token || !safeEqual(cookie, token)) {
    return next(new ForbiddenError('Invalid or missing CSRF token. Reload the page and try again.'));
  }
  next();
};

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email ?? '').toLowerCase().slice(0, 200)}`,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many sign-in attempts. Try again in 15 minutes.' } },
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, slow down.' } },
});

export function imageUpload(maxMb: number) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 5 },
  }).single('file');
}

export function csvUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  }).single('file');
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
};

export function errorHandler(logger: Logger) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      const mapped = err.code === 'LIMIT_FILE_SIZE' ? new PayloadTooLargeError('File is too large') : new ValidationError(err.message);
      return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
    }
    if (err instanceof ZodError) {
      return res.status(422).json({ error: { code: 'VALIDATION_FAILED', message: 'Validation failed', details: err.flatten() } });
    }
    if (err instanceof AppError) {
      if (err.status >= 500) logger.error({ err, path: req.path }, err.message);
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500;
    if (status < 500) {
      // e.g. body-parser errors (malformed JSON, payload too large)
      return res.status(status).json({ error: { code: 'BAD_REQUEST', message: (err as Error).message } });
    }
    logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
  };
}
