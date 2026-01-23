const AppError = require('../utils/AppError');

/**
 * Middleware to ensure tenant context is present
 * Must be used after authenticate middleware
 */
const requireTenant = (req, res, next) => {
  if (!req.user) {
    throw AppError.unauthorized('Authentication required');
  }

  // Super admins can operate without tenant context for admin operations
  if (req.user.role === 'SUPER_ADMIN') {
    return next();
  }

  // All other users must have a tenant
  if (!req.user.tenantId) {
    throw AppError.forbidden('Tenant context required');
  }

  next();
};

/**
 * Get tenant ID from request
 * Returns null for super admins operating globally (reads)
 * For super admins creating resources, falls back to their assigned tenantId
 * @param {Object} req - Express request object
 * @param {boolean} requireForCreate - If true, returns user's tenantId as fallback for SUPER_ADMIN
 * @returns {number|null}
 */
const getTenantId = (req, requireForCreate = true) => {
  if (!req.user) {
    return null;
  }

  // Super admin can optionally specify tenant via query/body
  if (req.user.role === 'SUPER_ADMIN') {
    const specifiedTenantId = req.query.tenantId || req.body?.tenantId;
    if (specifiedTenantId) {
      return parseInt(specifiedTenantId, 10);
    }
    // For create operations, fall back to user's assigned tenantId
    if (requireForCreate && req.user.tenantId) {
      return req.user.tenantId;
    }
    // Return null for global read operations
    return null;
  }

  return req.user.tenantId;
};

/**
 * Add tenant filter to database queries
 * @param {Object} req - Express request object
 * @param {Object} where - Prisma where clause
 * @returns {Object} - Modified where clause with tenant filter
 */
const addTenantFilter = (req, where = {}) => {
  const tenantId = getTenantId(req);

  // Don't filter for super admin global operations
  if (tenantId === null && req.user?.role === 'SUPER_ADMIN') {
    return where;
  }

  return {
    ...where,
    tenantId,
  };
};

/**
 * Validate that a resource belongs to the user's tenant
 * @param {number} resourceTenantId - Tenant ID of the resource
 * @param {Object} req - Express request object
 * @throws {AppError} - If resource doesn't belong to user's tenant
 */
const validateTenantAccess = (resourceTenantId, req) => {
  // Super admin can access all resources
  if (req.user?.role === 'SUPER_ADMIN') {
    return;
  }

  if (resourceTenantId !== req.user?.tenantId) {
    throw AppError.forbidden('Access denied to this resource');
  }
};

module.exports = {
  requireTenant,
  getTenantId,
  addTenantFilter,
  validateTenantAccess,
};
