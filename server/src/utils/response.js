/**
 * Standard API response helpers
 */

/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {Object} data - Response data
 * @param {number} statusCode - HTTP status code
 * @param {Object} meta - Additional metadata (pagination, etc.)
 */
const success = (res, data, statusCode = 200, meta = null) => {
  const response = {
    success: true,
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send created response (201)
 */
const created = (res, data) => {
  return success(res, data, 201);
};

/**
 * Send no content response (204)
 */
const noContent = (res) => {
  return res.status(204).send();
};

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Object} details - Error details (validation errors, etc.)
 */
const error = (res, code, message, statusCode = 500, details = null) => {
  const response = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (details) {
    response.error.details = details;
  }

  return res.status(statusCode).json(response);
};

/**
 * Send paginated response
 * @param {Object} res - Express response object
 * @param {Array} data - Array of items
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items count
 */
const paginated = (res, data, page, limit, total) => {
  const totalPages = Math.ceil(total / limit);

  return success(res, data, 200, {
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
};

module.exports = {
  success,
  created,
  noContent,
  error,
  paginated,
};
