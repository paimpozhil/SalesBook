const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { error: errorResponse } = require('../utils/response');
const config = require('../config');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error(err.message, {
    code: err.code,
    statusCode: err.statusCode,
    path: req.path,
    method: req.method,
    stack: config.env === 'development' ? err.stack : undefined,
  });

  // Handle Prisma errors
  if (err.code === 'P2002') {
    return errorResponse(
      res,
      'CONFLICT',
      'A record with this value already exists',
      409,
      { field: err.meta?.target }
    );
  }

  if (err.code === 'P2025') {
    return errorResponse(
      res,
      'NOT_FOUND',
      'Record not found',
      404
    );
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 'UNAUTHORIZED', 'Invalid token', 401);
  }

  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 'UNAUTHORIZED', 'Token expired', 401);
  }

  // Handle validation errors from express-validator
  if (err.array && typeof err.array === 'function') {
    const validationErrors = err.array();
    return errorResponse(
      res,
      'VALIDATION_ERROR',
      'Validation failed',
      400,
      validationErrors.map((e) => ({ field: e.path, message: e.msg }))
    );
  }

  // Handle our custom AppError
  if (err instanceof AppError) {
    return errorResponse(
      res,
      err.code,
      err.message,
      err.statusCode,
      err.details
    );
  }

  // Handle unexpected errors
  const statusCode = err.statusCode || 500;
  const message = config.env === 'production'
    ? 'Internal server error'
    : err.message;

  return errorResponse(
    res,
    'INTERNAL_ERROR',
    message,
    statusCode
  );
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res) => {
  return errorResponse(
    res,
    'NOT_FOUND',
    `Route ${req.method} ${req.path} not found`,
    404
  );
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
