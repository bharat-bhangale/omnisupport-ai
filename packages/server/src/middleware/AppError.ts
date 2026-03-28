/**
 * Custom application error class for consistent error handling
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Create a 400 Bad Request error
   */
  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, 400, true, 'BAD_REQUEST', details);
  }

  /**
   * Create a 401 Unauthorized error
   */
  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(message, 401, true, 'UNAUTHORIZED');
  }

  /**
   * Create a 403 Forbidden error
   */
  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(message, 403, true, 'FORBIDDEN');
  }

  /**
   * Create a 404 Not Found error
   */
  static notFound(resource: string = 'Resource'): AppError {
    return new AppError(`${resource} not found`, 404, true, 'NOT_FOUND');
  }

  /**
   * Create a 409 Conflict error
   */
  static conflict(message: string): AppError {
    return new AppError(message, 409, true, 'CONFLICT');
  }

  /**
   * Create a 422 Validation error
   */
  static validation(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, 422, true, 'VALIDATION_ERROR', details);
  }

  /**
   * Create a 429 Rate Limit error
   */
  static rateLimited(message: string = 'Too many requests'): AppError {
    return new AppError(message, 429, true, 'RATE_LIMITED');
  }

  /**
   * Create a 500 Internal Server error
   */
  static internal(message: string = 'Internal server error'): AppError {
    return new AppError(message, 500, false, 'INTERNAL_ERROR');
  }

  /**
   * Create a 503 Service Unavailable error
   */
  static serviceUnavailable(service: string): AppError {
    return new AppError(`${service} is temporarily unavailable`, 503, true, 'SERVICE_UNAVAILABLE');
  }

  /**
   * Create an error for external API failures
   */
  static externalService(service: string, originalError?: Error): AppError {
    const message = originalError
      ? `${service} error: ${originalError.message}`
      : `${service} request failed`;
    return new AppError(message, 502, true, 'EXTERNAL_SERVICE_ERROR', {
      service,
      originalMessage: originalError?.message,
    });
  }
}
