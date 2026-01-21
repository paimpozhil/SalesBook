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
 * @route   GET /api/v1/data-sources
 * @desc    List data sources
 * @access  Private
 */
router.get(
  '/',
  requirePermission('sources:read'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('type').optional().isIn(['PLAYWRIGHT', 'API', 'RSS', 'MANUAL']),
    query('isActive').optional().isBoolean().toBoolean(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    const where = addTenantFilter(req, {});

    if (req.query.type) where.type = req.query.type;
    if (req.query.isActive !== undefined) where.isActive = req.query.isActive;

    const [sources, total] = await Promise.all([
      prisma.dataSource.findMany({
        where,
        select: {
          id: true,
          name: true,
          type: true,
          url: true,
          isActive: true,
          lastRunAt: true,
          lastStatus: true,
          pollingFrequency: true,
          rateLimit: true,
          createdAt: true,
          _count: { select: { leads: true, runs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dataSource.count({ where }),
    ]);

    return paginated(res, sources, page, limit, total);
  })
);

/**
 * @route   POST /api/v1/data-sources
 * @desc    Create data source
 * @access  Private
 */
router.post(
  '/',
  requirePermission('sources:create'),
  [
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('type').isIn(['PLAYWRIGHT', 'API', 'RSS', 'MANUAL']),
    body('url').isURL(),
    body('config').isObject(),
    body('rateLimit').optional().isInt({ min: 1 }),
    body('pollingFrequency').optional(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name, type, url, config, proxyConfig, rateLimit, pollingFrequency } = req.body;

    const source = await prisma.dataSource.create({
      data: {
        tenantId: getTenantId(req),
        name,
        type,
        url,
        config,
        proxyConfig,
        rateLimit,
        pollingFrequency,
      },
    });

    return created(res, source);
  })
);

/**
 * @route   GET /api/v1/data-sources/:id
 * @desc    Get data source
 * @access  Private
 */
router.get(
  '/:id',
  requirePermission('sources:read'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const source = await prisma.dataSource.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: {
        _count: { select: { leads: true, runs: true } },
      },
    });

    if (!source) throw AppError.notFound('Data source not found');

    return success(res, source);
  })
);

/**
 * @route   PATCH /api/v1/data-sources/:id
 * @desc    Update data source
 * @access  Private
 */
router.patch(
  '/:id',
  requirePermission('sources:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const { name, url, config, proxyConfig, rateLimit, pollingFrequency, isActive } = req.body;

    const existing = await prisma.dataSource.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) throw AppError.notFound('Data source not found');

    const source = await prisma.dataSource.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(url && { url }),
        ...(config && { config }),
        ...(proxyConfig !== undefined && { proxyConfig }),
        ...(rateLimit !== undefined && { rateLimit }),
        ...(pollingFrequency !== undefined && { pollingFrequency }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return success(res, source);
  })
);

/**
 * @route   DELETE /api/v1/data-sources/:id
 * @desc    Delete data source
 * @access  Private
 */
router.delete(
  '/:id',
  requirePermission('sources:delete'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const existing = await prisma.dataSource.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) throw AppError.notFound('Data source not found');

    await prisma.dataSource.delete({ where: { id: req.params.id } });

    return noContent(res);
  })
);

/**
 * @route   POST /api/v1/data-sources/:id/run
 * @desc    Trigger manual run
 * @access  Private
 */
router.post(
  '/:id/run',
  requirePermission('sources:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const source = await prisma.dataSource.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!source) throw AppError.notFound('Data source not found');

    // Create a job to run the scraper
    const job = await prisma.jobQueue.create({
      data: {
        tenantId: source.tenantId,
        type: 'SCRAPE',
        payload: { dataSourceId: source.id },
        priority: 1,
      },
    });

    return success(res, { message: 'Scrape job queued', jobId: job.id });
  })
);

/**
 * @route   GET /api/v1/data-sources/:id/runs
 * @desc    Get run history
 * @access  Private
 */
router.get(
  '/:id/runs',
  requirePermission('sources:read'),
  [
    param('id').isInt().toInt(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    // Verify source belongs to tenant
    const source = await prisma.dataSource.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!source) throw AppError.notFound('Data source not found');

    const [runs, total] = await Promise.all([
      prisma.dataSourceRun.findMany({
        where: { dataSourceId: req.params.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dataSourceRun.count({ where: { dataSourceId: req.params.id } }),
    ]);

    return paginated(res, runs, page, limit, total);
  })
);

module.exports = router;
