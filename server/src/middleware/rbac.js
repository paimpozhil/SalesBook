const AppError = require('../utils/AppError');

/**
 * Role hierarchy and permissions
 */
const ROLE_HIERARCHY = {
  SUPER_ADMIN: 4,
  TENANT_ADMIN: 3,
  MANAGER: 2,
  SALES_REP: 1,
};

/**
 * Permission definitions
 * Format: resource:action
 */
const PERMISSIONS = {
  SUPER_ADMIN: ['*'],
  TENANT_ADMIN: [
    'users:*',
    'leads:*',
    'contacts:*',
    'campaigns:*',
    'templates:*',
    'channels:*',
    'sources:*',
    'analytics:read',
    'settings:*',
  ],
  MANAGER: [
    'users:read',
    'leads:*',
    'contacts:*',
    'campaigns:*',
    'templates:*',
    'channels:read',
    'sources:read',
    'analytics:read',
  ],
  SALES_REP: [
    'leads:read',
    'leads:update',
    'contacts:read',
    'contacts:update',
    'campaigns:read',
    'templates:read',
    'channels:read',
    'analytics:read',
  ],
};

/**
 * Check if a role has a specific permission
 * @param {string} role - User role
 * @param {string} permission - Permission to check (e.g., 'leads:create')
 * @returns {boolean}
 */
const hasPermission = (role, permission) => {
  const rolePermissions = PERMISSIONS[role] || [];

  // Super admin has all permissions
  if (rolePermissions.includes('*')) {
    return true;
  }

  const [resource, action] = permission.split(':');

  // Check for exact match
  if (rolePermissions.includes(permission)) {
    return true;
  }

  // Check for wildcard permission on resource (e.g., 'leads:*')
  if (rolePermissions.includes(`${resource}:*`)) {
    return true;
  }

  return false;
};

/**
 * Check if user's role is at least the minimum required
 * @param {string} userRole - User's role
 * @param {string} minRole - Minimum required role
 * @returns {boolean}
 */
const hasMinimumRole = (userRole, minRole) => {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[minRole] || 0);
};

/**
 * Middleware factory to require specific roles
 * @param {...string} allowedRoles - Allowed roles
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw AppError.unauthorized('Authentication required');
    }

    const userRole = req.user.role;

    // Super admin always has access
    if (userRole === 'SUPER_ADMIN') {
      return next();
    }

    if (!allowedRoles.includes(userRole)) {
      throw AppError.forbidden('Insufficient permissions');
    }

    next();
  };
};

/**
 * Middleware factory to require specific permissions
 * @param {...string} requiredPermissions - Required permissions
 */
const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      throw AppError.unauthorized('Authentication required');
    }

    const userRole = req.user.role;

    // Check all required permissions
    for (const permission of requiredPermissions) {
      if (!hasPermission(userRole, permission)) {
        throw AppError.forbidden(`Missing permission: ${permission}`);
      }
    }

    next();
  };
};

/**
 * Middleware to require super admin role
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    throw AppError.unauthorized('Authentication required');
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    throw AppError.forbidden('Super admin access required');
  }

  next();
};

/**
 * Middleware to require tenant admin or higher
 */
const requireTenantAdmin = (req, res, next) => {
  if (!req.user) {
    throw AppError.unauthorized('Authentication required');
  }

  if (!hasMinimumRole(req.user.role, 'TENANT_ADMIN')) {
    throw AppError.forbidden('Admin access required');
  }

  next();
};

module.exports = {
  hasPermission,
  hasMinimumRole,
  requireRole,
  requirePermission,
  requireSuperAdmin,
  requireTenantAdmin,
  PERMISSIONS,
  ROLE_HIERARCHY,
};
