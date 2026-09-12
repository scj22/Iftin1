import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { isDbConnected } from '../config/db.js';

/** An error carrying an HTTP status, so controllers can fail declaratively. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wraps an async handler so rejections reach the error middleware. */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

/** Validates `req[source]` against a Zod schema and replaces it with the parsed value. */
export const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(
          new ApiError(
            400,
            'Some of the details you entered are not valid.',
            error.issues.map((issue) => ({
              field: issue.path.join('.') || '(root)',
              message: issue.message,
            })),
          ),
        );
        return;
      }
      next(error);
    }
  };

/** Rejects requests to endpoints that genuinely need persistence when it is down. */
export function requireDatabase(_req, _res, next) {
  if (isDbConnected()) return next();
  next(
    new ApiError(
      503,
      'Accounts and saved routes need the database, which is not reachable right now. ' +
        'Navigation and traffic still work.',
    ),
  );
}

export function signAccessToken(user) {
  return jwt.sign({ sub: user.id ?? user._id.toString(), email: user.email }, env.jwtSecret, {
    expiresIn: env.accessTokenTtl,
  });
}

export function signRefreshToken(user) {
  return jwt.sign({ sub: user.id ?? user._id.toString(), type: 'refresh' }, env.refreshSecret, {
    expiresIn: env.refreshTokenTtl,
  });
}

/** Requires a valid bearer access token and attaches `req.auth`. */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'You need to sign in to use this.'));
  }
  try {
    req.auth = jwt.verify(token, env.jwtSecret);
    next();
  } catch (error) {
    const expired = error.name === 'TokenExpiredError';
    next(
      new ApiError(401, expired ? 'Your session has expired. Please sign in again.' : 'Invalid session token.', {
        expired,
      }),
    );
  }
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please wait a few minutes and try again.' } },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many requests. Please slow down a little.' } },
});

export function notFound(req, _res, next) {
  next(new ApiError(404, `No API route matches ${req.method} ${req.originalUrl}`));
}

/* eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity. */
export function errorHandler(error, req, res, _next) {
  const status = error.status ?? 500;

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  if (error.code === 11000) {
    return res.status(409).json({
      error: { message: 'An account with that email address already exists.' },
    });
  }

  res.status(status).json({
    error: {
      message:
        status >= 500 && env.isProduction
          ? 'Something went wrong on our side. Please try again.'
          : error.message,
      details: error.details,
    },
  });
}
