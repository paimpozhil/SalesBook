const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { asyncHandler } = require('./errorHandler');

/**
 * Authenticate JWT token
 */
const authenticate = asyncHandler(async (req, res, next) => {
  // Get token from header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw AppError.unauthorized('No token provided');
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        tenantId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      throw AppError.unauthorized('User not found');
    }

    if (user.status !== 'ACTIVE') {
      throw AppError.unauthorized('User account is not active');
    }

    // Check tenant status (if user belongs to a tenant)
    if (user.tenant && user.tenant.status !== 'ACTIVE') {
      throw AppError.unauthorized('Tenant account is not active');
    }

    // Attach user and tenant info to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    };

    req.tenant = user.tenant;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw AppError.unauthorized('Invalid token');
    }
    if (error.name === 'TokenExpiredError') {
      throw AppError.unauthorized('Token expired');
    }
    throw error;
  }
});

/**
 * Optional authentication - doesn't fail if no token
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  // If token exists, validate it
  return authenticate(req, res, next);
});

/**
 * Generate access token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
};

/**
 * Verify refresh token
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.secret);
};

module.exports = {
  authenticate,
  optionalAuth,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
};
