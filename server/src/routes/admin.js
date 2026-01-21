const express = require('express');
const { body, param, query } = require('express-validator');
const bcrypt = require('bcryptjs');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/rbac');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { success, paginated, noContent, created } = require('../utils/response');

const router = express.Router();

// All admin routes require super admin
router.use(authenticate);
router.use(requireSuperAdmin);

/**
 * @route   GET /api/v1/admin/tenants
 * @desc    List all tenants
 * @access  Super Admin
 */
router.get(
  '/tenants',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['ACTIVE', 'SUSPENDED', 'TRIAL']),
    query('search').optional().trim(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.search) {
      where.OR = [
        { name: { contains: req.query.search } },
        { slug: { contains: req.query.search } },
      ];
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        include: {
          _count: {
            select: { users: true, leads: true, campaigns: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.tenant.count({ where }),
    ]);

    return paginated(res, tenants, page, limit, total);
  })
);

/**
 * @route   POST /api/v1/admin/tenants
 * @desc    Create tenant with admin user
 * @access  Super Admin
 */
router.post(
  '/tenants',
  [
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('slug').trim().isLength({ min: 1, max: 100 }).matches(/^[a-z0-9-]+$/),
    body('adminEmail').isEmail().normalizeEmail(),
    body('adminName').trim().isLength({ min: 1, max: 255 }),
    body('adminPassword').isLength({ min: 8 }),
    body('status').optional().isIn(['ACTIVE', 'SUSPENDED', 'TRIAL']),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name, slug, adminEmail, adminName, adminPassword, status, settings } = req.body;

    // Check slug uniqueness
    const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
    if (existingTenant) {
      throw AppError.conflict('Tenant slug already exists');
    }

    // Check email uniqueness
    const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) {
      throw AppError.conflict('Admin email already exists');
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name,
          slug,
          status: status || 'ACTIVE',
          settings: settings || {},
        },
      });

      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: adminEmail,
          passwordHash,
          name: adminName,
          role: 'TENANT_ADMIN',
          status: 'ACTIVE',
        },
      });

      return { tenant, admin };
    });

    return created(res, {
      tenant: result.tenant,
      admin: {
        id: result.admin.id,
        email: result.admin.email,
        name: result.admin.name,
      },
    });
  })
);

/**
 * @route   GET /api/v1/admin/tenants/:id
 * @desc    Get tenant details
 * @access  Super Admin
 */
router.get(
  '/tenants/:id',
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            lastLoginAt: true,
          },
        },
        _count: {
          select: {
            leads: true,
            campaigns: true,
            dataSources: true,
            channelConfigs: true,
          },
        },
      },
    });

    if (!tenant) throw AppError.notFound('Tenant not found');

    return success(res, tenant);
  })
);

/**
 * @route   PATCH /api/v1/admin/tenants/:id
 * @desc    Update tenant
 * @access  Super Admin
 */
router.patch(
  '/tenants/:id',
  [
    param('id').isInt().toInt(),
    body('name').optional().trim().isLength({ min: 1, max: 255 }),
    body('status').optional().isIn(['ACTIVE', 'SUSPENDED', 'TRIAL']),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name, status, settings } = req.body;

    const existing = await prisma.tenant.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) throw AppError.notFound('Tenant not found');

    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(status && { status }),
        ...(settings && { settings }),
      },
    });

    return success(res, tenant);
  })
);

/**
 * @route   DELETE /api/v1/admin/tenants/:id
 * @desc    Delete tenant (and all data)
 * @access  Super Admin
 */
router.delete(
  '/tenants/:id',
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const existing = await prisma.tenant.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) throw AppError.notFound('Tenant not found');

    // Delete tenant (cascade deletes all related data)
    await prisma.tenant.delete({ where: { id: req.params.id } });

    return noContent(res);
  })
);

/**
 * @route   GET /api/v1/admin/stats
 * @desc    System-wide statistics
 * @access  Super Admin
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [
      totalTenants,
      activeTenants,
      totalUsers,
      totalLeads,
      totalCampaigns,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count(),
      prisma.lead.count(),
      prisma.campaign.count(),
    ]);

    return success(res, {
      totalTenants,
      activeTenants,
      totalUsers,
      totalLeads,
      totalCampaigns,
    });
  })
);

module.exports = router;
