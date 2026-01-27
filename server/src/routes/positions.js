const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, addTenantFilter, getTenantId } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { success, paginated, noContent, created } = require('../utils/response');

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/positions
 * @desc    List all positions for tenant
 * @access  Private
 */
router.get(
  '/',
  requirePermission('leads:read'),
  [
    query('search').optional().trim(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 50;
    const skip = (page - 1) * limit;

    const where = addTenantFilter(req, {});

    if (req.query.search) {
      where.name = { contains: req.query.search };
    }

    const [positions, total] = await Promise.all([
      prisma.position.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        include: {
          _count: {
            select: { contacts: true },
          },
        },
      }),
      prisma.position.count({ where }),
    ]);

    return paginated(res, positions, page, limit, total);
  })
);

/**
 * @route   POST /api/v1/positions
 * @desc    Create a new position
 * @access  Private
 */
router.post(
  '/',
  requirePermission('leads:create'),
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Position name required (max 100 chars)'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    const tenantId = getTenantId(req);

    // Check if position already exists
    const existing = await prisma.position.findFirst({
      where: { tenantId, name },
    });

    if (existing) {
      throw AppError.conflict('Position already exists');
    }

    const position = await prisma.position.create({
      data: { tenantId, name },
    });

    return created(res, position);
  })
);

/**
 * @route   POST /api/v1/positions/find-or-create
 * @desc    Find existing position or create new one
 * @access  Private
 */
router.post(
  '/find-or-create',
  requirePermission('leads:create'),
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Position name required (max 100 chars)'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    const tenantId = getTenantId(req);

    // Try to find existing position (case-insensitive)
    let position = await prisma.position.findFirst({
      where: {
        tenantId,
        name: { equals: name, mode: 'insensitive' },
      },
    });

    if (!position) {
      // Create new position
      position = await prisma.position.create({
        data: { tenantId, name },
      });
    }

    return success(res, position);
  })
);

/**
 * @route   GET /api/v1/positions/:id
 * @desc    Get position by ID
 * @access  Private
 */
router.get(
  '/:id',
  requirePermission('leads:read'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const position = await prisma.position.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: {
        _count: {
          select: { contacts: true },
        },
      },
    });

    if (!position) {
      throw AppError.notFound('Position not found');
    }

    return success(res, position);
  })
);

/**
 * @route   PATCH /api/v1/positions/:id
 * @desc    Update position
 * @access  Private
 */
router.patch(
  '/:id',
  requirePermission('leads:update'),
  [
    param('id').isInt().toInt(),
    body('name').trim().isLength({ min: 1, max: 100 }),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    const tenantId = getTenantId(req);

    const existing = await prisma.position.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) {
      throw AppError.notFound('Position not found');
    }

    // Check if new name conflicts with another position
    const conflict = await prisma.position.findFirst({
      where: {
        tenantId,
        name,
        id: { not: req.params.id },
      },
    });

    if (conflict) {
      throw AppError.conflict('Position name already exists');
    }

    const position = await prisma.position.update({
      where: { id: req.params.id },
      data: { name },
    });

    return success(res, position);
  })
);

/**
 * @route   DELETE /api/v1/positions/:id
 * @desc    Delete position
 * @access  Private
 */
router.delete(
  '/:id',
  requirePermission('leads:delete'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const existing = await prisma.position.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: {
        _count: {
          select: { contacts: true },
        },
      },
    });

    if (!existing) {
      throw AppError.notFound('Position not found');
    }

    if (existing._count.contacts > 0) {
      throw AppError.badRequest(`Cannot delete position with ${existing._count.contacts} associated contacts`);
    }

    await prisma.position.delete({
      where: { id: req.params.id },
    });

    return noContent(res);
  })
);

module.exports = router;
