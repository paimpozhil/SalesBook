const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/database');
const config = require('../config');
const AppError = require('../utils/AppError');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../middleware/auth');
const logger = require('../utils/logger');

const SALT_ROUNDS = 12;

/**
 * Register a new tenant with admin user
 */
const registerTenant = async ({ email, password, name, companyName }) => {
  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw AppError.conflict('Email already registered');
  }

  // Generate slug from company name
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  // Check if slug exists, append random string if needed
  let finalSlug = slug;
  const existingTenant = await prisma.tenant.findUnique({
    where: { slug },
  });

  if (existingTenant) {
    finalSlug = `${slug}-${uuidv4().slice(0, 8)}`;
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Create tenant and admin user in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create tenant
    const tenant = await tx.tenant.create({
      data: {
        name: companyName,
        slug: finalSlug,
        status: 'ACTIVE',
        settings: {},
      },
    });

    // Create admin user
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash,
        name,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
      },
    });

    return { tenant, user };
  });

  // Generate tokens
  const accessToken = generateAccessToken(result.user);
  const refreshToken = generateRefreshToken(result.user);

  // Store refresh token
  const refreshTokenExpiry = new Date();
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 days

  await prisma.refreshToken.create({
    data: {
      userId: result.user.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiry,
    },
  });

  logger.info('New tenant registered', {
    tenantId: result.tenant.id,
    userId: result.user.id,
    email,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: 3600,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      tenantId: result.user.tenantId,
    },
    tenant: {
      id: result.tenant.id,
      name: result.tenant.name,
      slug: result.tenant.slug,
    },
  };
};

/**
 * Login user
 */
const login = async ({ email, password }) => {
  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
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
    throw AppError.unauthorized('Invalid credentials');
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw AppError.unauthorized('Invalid credentials');
  }

  // Check user status
  if (user.status !== 'ACTIVE') {
    throw AppError.unauthorized('Account is not active');
  }

  // Check tenant status (if user has a tenant)
  if (user.tenant && user.tenant.status !== 'ACTIVE') {
    throw AppError.unauthorized('Organization account is not active');
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store refresh token
  const refreshTokenExpiry = new Date();
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiry,
    },
  });

  logger.info('User logged in', { userId: user.id, email });

  return {
    accessToken,
    refreshToken,
    expiresIn: 3600,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    },
    tenant: user.tenant,
  };
};

/**
 * Refresh access token
 */
const refreshAccessToken = async (refreshToken) => {
  // Verify token
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw AppError.unauthorized('Invalid refresh token');
  }

  // Check if token exists in database
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: {
      user: {
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!storedToken) {
    throw AppError.unauthorized('Refresh token not found');
  }

  // Check if token is expired
  if (new Date() > storedToken.expiresAt) {
    // Delete expired token
    await prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });
    throw AppError.unauthorized('Refresh token expired');
  }

  const user = storedToken.user;

  // Check user status
  if (user.status !== 'ACTIVE') {
    throw AppError.unauthorized('Account is not active');
  }

  // Delete old refresh token (token rotation)
  await prisma.refreshToken.delete({
    where: { id: storedToken.id },
  });

  // Generate new tokens
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  // Store new refresh token
  const refreshTokenExpiry = new Date();
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: newRefreshToken,
      expiresAt: refreshTokenExpiry,
    },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: 3600,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
    },
  };
};

/**
 * Logout - invalidate refresh token
 */
const logout = async (refreshToken) => {
  if (!refreshToken) return;

  await prisma.refreshToken.deleteMany({
    where: { token: refreshToken },
  });
};

/**
 * Change password
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw AppError.notFound('User not found');
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);

  if (!isPasswordValid) {
    throw AppError.badRequest('Current password is incorrect');
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  // Invalidate all refresh tokens
  await prisma.refreshToken.deleteMany({
    where: { userId },
  });

  logger.info('Password changed', { userId });
};

/**
 * Get current user profile
 */
const getCurrentUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      tenantId: true,
      lastLoginAt: true,
      createdAt: true,
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
    throw AppError.notFound('User not found');
  }

  return user;
};

module.exports = {
  registerTenant,
  login,
  refreshAccessToken,
  logout,
  changePassword,
  getCurrentUser,
};
