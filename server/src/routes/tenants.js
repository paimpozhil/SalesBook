const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, getTenantId } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { success } = require('../utils/response');

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/tenants/current
 * @desc    Get current tenant
 * @access  Private
 */
router.get(
  '/current',
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        settings: true,
        createdAt: true,
      },
    });

    if (!tenant) throw AppError.notFound('Tenant not found');

    return success(res, tenant);
  })
);

/**
 * @route   PUT /api/v1/tenants/current
 * @desc    Update current tenant
 * @access  Private (Admin only)
 */
router.put(
  '/current',
  [
    body('name').optional().trim().isLength({ min: 1, max: 255 }),
    body('settings').optional().isObject(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { name, settings } = req.body;

    // Check if user has permission (TENANT_ADMIN or SUPER_ADMIN)
    if (!['TENANT_ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      throw AppError.forbidden('Only admins can update organization settings');
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(name && { name }),
        ...(settings && { settings }),
      },
      select: {
        id: true,
        name: true,
        settings: true,
        createdAt: true,
      },
    });

    return success(res, tenant);
  })
);

module.exports = router;
