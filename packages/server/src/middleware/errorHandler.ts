import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from './AppError.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
    stack?: string;
  };
  requestId?: string;
}

/**
 * Get request ID from request (set by requestId middleware)
 */
function getRequestId(req: Request): string | undefined {
  return (req as Request & { id?: string }).id;
}

/**
 * Global error handler middleware
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = getRequestId(req);

  // Log context
  const logContext = {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userId: (req as Request & { user?: { sub?: string; userId?: string } }).user?.userId ||
            (req as Request & { user?: { sub?: string } }).user?.sub,
  };

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const validationError = AppError.validation('Validation failed', {
      errors: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });

    logger.warn({ ...logContext, err: validationError }, 'Validation error');

    const response: ErrorResponse = {
      success: false,
      error: {
        message: validationError.message,
        code: validationError.code,
        details: validationError.details,
      },
      requestId,
    };

    res.status(validationError.statusCode).json(response);
    return;
  }

  // Handle AppError instances
  if (err instanceof AppError) {
    if (err.isOperational) {
      logger.warn({ ...logContext, err }, 'Operational error');
    } else {
      logger.error({ ...logContext, err }, 'Non-operational error');
    }

    const response: ErrorResponse = {
      success: false,
      error: {
        message: err.message,
        code: err.code,
        details: err.details,
        ...(env.NODE_ENV === 'development' && { stack: err.stack }),
      },
      requestId,
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle unknown errors
  logger.error({ ...logContext, err, stack: err.stack }, 'Unhandled error');

  const response: ErrorResponse = {
    success: false,
    error: {
      message: env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      code: 'INTERNAL_ERROR',
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    },
    requestId,
  };

  res.status(500).json(response);
};

/**
 * 404 handler for unmatched routes
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const requestId = getRequestId(req);

  const response: ErrorResponse = {
    success: false,
    error: {
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
    },
    requestId,
  };

  res.status(404).json(response);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
export const asyncHandler = <T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
