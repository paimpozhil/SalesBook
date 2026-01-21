/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(code, statusCode, message, details = null) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', details = null) {
    return new AppError('BAD_REQUEST', 400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError('UNAUTHORIZED', 401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError('FORBIDDEN', 403, message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError('NOT_FOUND', 404, message);
  }

  static conflict(message = 'Resource already exists') {
    return new AppError('CONFLICT', 409, message);
  }

  static validationError(details) {
    return new AppError('VALIDATION_ERROR', 400, 'Validation failed', details);
  }

  static rateLimited(message = 'Too many requests') {
    return new AppError('RATE_LIMITED', 429, message);
  }

  static internal(message = 'Internal server error') {
    return new AppError('INTERNAL_ERROR', 500, message);
  }
}

module.exports = AppError;
