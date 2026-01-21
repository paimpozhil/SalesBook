const express = require('express');
const { body, param, query } = require('express-validator');
const bcrypt = require('bcryptjs');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requireTenantAdmin } = require('../middleware/rbac');
const { requireTenant, addTenantFilter } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { success, paginated, noContent } = require('../utils/response');

const router = express.Router();

// All routes require authentication and tenant context
router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/users
 * @desc    List users in tenant
 * @access  Private (Tenant Admin)
 */
router.get(
  '/',
  requireTenantAdmin,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('role').optional().isIn(['TENANT_ADMIN', 'MANAGER', 'SALES_REP']),
    query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'PENDING']),
    query('search').optional().trim(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    const where = addTenantFilter(req, {});

    // Add filters
    if (req.query.role) {
      where.role = req.query.role;
    }
    if (req.query.status) {
      where.status = req.query.status;
    }
    if (req.query.search) {
      where.OR = [
        { name: { contains: req.query.search } },
        { email: { contains: req.query.search } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return paginated(res, users, page, limit, total);
  })
);

/**
 * @route   POST /api/v1/users
 * @desc    Create new user in tenant
 * @access  Private (Tenant Admin)
 */
router.post(
  '/',
  requireTenantAdmin,
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Name required'),
    body('role').isIn(['TENANT_ADMIN', 'MANAGER', 'SALES_REP']).withMessage('Invalid role'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { email, password, name, role } = req.body;

    // Check if email exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw AppError.conflict('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        tenantId: req.user.tenantId,
        email,
        passwordHash,
        name,
        role,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return success(res, user, 201);
  })
);

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get user by ID
 * @access  Private (Tenant Admin)
 */
router.get(
  '/:id',
  requireTenantAdmin,
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw AppError.notFound('User not found');
    }

    return success(res, user);
  })
);

/**
 * @route   PATCH /api/v1/users/:id
 * @desc    Update user
 * @access  Private (Tenant Admin)
 */
router.patch(
  '/:id',
  requireTenantAdmin,
  [
    param('id').isInt().toInt(),
    body('name').optional().trim().isLength({ min: 1, max: 255 }),
    body('role').optional().isIn(['TENANT_ADMIN', 'MANAGER', 'SALES_REP']),
    body('status').optional().isIn(['ACTIVE', 'INACTIVE']),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name, role, status } = req.body;

    // Verify user exists in tenant
    const existing = await prisma.user.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) {
      throw AppError.notFound('User not found');
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(role && { role }),
        ...(status && { status }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    return success(res, user);
  })
);

/**
 * @route   DELETE /api/v1/users/:id
 * @desc    Delete user
 * @access  Private (Tenant Admin)
 */
router.delete(
  '/:id',
  requireTenantAdmin,
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    // Can't delete yourself
    if (req.params.id === req.user.id) {
      throw AppError.badRequest('Cannot delete your own account');
    }

    // Verify user exists in tenant
    const existing = await prisma.user.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) {
      throw AppError.notFound('User not found');
    }

    await prisma.user.delete({
      where: { id: req.params.id },
    });

    return noContent(res);
  })
);

module.exports = router;
