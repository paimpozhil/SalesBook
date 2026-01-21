const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

/**
 * Validation middleware - checks for validation errors
 * Use after express-validator check rules
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const details = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
      value: err.value,
    }));

    throw AppError.validationError(details);
  }

  next();
};

/**
 * Common validation rules
 */
const rules = {
  // Pagination
  page: {
    in: ['query'],
    optional: true,
    isInt: { options: { min: 1 } },
    toInt: true,
    errorMessage: 'Page must be a positive integer',
  },
  limit: {
    in: ['query'],
    optional: true,
    isInt: { options: { min: 1, max: 100 } },
    toInt: true,
    errorMessage: 'Limit must be between 1 and 100',
  },

  // ID parameters
  id: {
    in: ['params'],
    isInt: { options: { min: 1 } },
    toInt: true,
    errorMessage: 'Invalid ID',
  },

  // Common fields
  email: {
    in: ['body'],
    isEmail: true,
    normalizeEmail: true,
    errorMessage: 'Valid email is required',
  },
  password: {
    in: ['body'],
    isLength: { options: { min: 8, max: 100 } },
    errorMessage: 'Password must be 8-100 characters',
  },
  name: {
    in: ['body'],
    trim: true,
    isLength: { options: { min: 1, max: 255 } },
    errorMessage: 'Name is required (max 255 characters)',
  },

  // Optional fields
  optionalEmail: {
    in: ['body'],
    optional: { options: { nullable: true } },
    isEmail: true,
    normalizeEmail: true,
    errorMessage: 'Must be a valid email',
  },
  optionalUrl: {
    in: ['body'],
    optional: { options: { nullable: true } },
    isURL: true,
    errorMessage: 'Must be a valid URL',
  },
  optionalPhone: {
    in: ['body'],
    optional: { options: { nullable: true } },
    matches: {
      options: /^[\d\s\-+()]+$/,
    },
    errorMessage: 'Must be a valid phone number',
  },
};

module.exports = {
  validate,
  rules,
};
