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
 * @route   GET /api/v1/industries
 * @desc    List all industries for tenant
 * @access  Private
 */
router.get(
  '/',
  requirePermission('leads:read'),
  [
    query('search').optional().trim(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const where = addTenantFilter(req, {});

    if (req.query.search) {
      where.name = { contains: req.query.search };
    }

    const industries = await prisma.industry.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { leads: true },
        },
      },
    });

    return success(res, industries);
  })
);

/**
 * @route   POST /api/v1/industries
 * @desc    Create a new industry
 * @access  Private
 */
router.post(
  '/',
  requirePermission('leads:create'),
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Industry name required (max 100 chars)'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name } = req.body;
    const tenantId = getTenantId(req);

    // Check if industry already exists
    const existing = await prisma.industry.findFirst({
      where: { tenantId, name },
    });

    if (existing) {
      throw AppError.conflict('Industry already exists');
    }

    const industry = await prisma.industry.create({
      data: { tenantId, name },
    });

    return created(res, industry);
  })
);

/**
 * @route   GET /api/v1/industries/:id
 * @desc    Get industry by ID
 * @access  Private
 */
router.get(
  '/:id',
  requirePermission('leads:read'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const industry = await prisma.industry.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: {
        _count: {
          select: { leads: true },
        },
      },
    });

    if (!industry) {
      throw AppError.notFound('Industry not found');
    }

    return success(res, industry);
  })
);

/**
 * @route   PATCH /api/v1/industries/:id
 * @desc    Update industry
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

    const existing = await prisma.industry.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) {
      throw AppError.notFound('Industry not found');
    }

    // Check if new name conflicts with another industry
    const conflict = await prisma.industry.findFirst({
      where: {
        tenantId,
        name,
        id: { not: req.params.id },
      },
    });

    if (conflict) {
      throw AppError.conflict('Industry name already exists');
    }

    const industry = await prisma.industry.update({
      where: { id: req.params.id },
      data: { name },
    });

    return success(res, industry);
  })
);

/**
 * @route   DELETE /api/v1/industries/:id
 * @desc    Delete industry
 * @access  Private
 */
router.delete(
  '/:id',
  requirePermission('leads:delete'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const existing = await prisma.industry.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: {
        _count: {
          select: { leads: true },
        },
      },
    });

    if (!existing) {
      throw AppError.notFound('Industry not found');
    }

    if (existing._count.leads > 0) {
      throw AppError.badRequest(`Cannot delete industry with ${existing._count.leads} associated leads`);
    }

    await prisma.industry.delete({
      where: { id: req.params.id },
    });

    return noContent(res);
  })
);

module.exports = router;
