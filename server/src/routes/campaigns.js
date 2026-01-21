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
 * @route   GET /api/v1/campaigns
 * @desc    List campaigns
 * @access  Private
 */
router.get(
  '/',
  requirePermission('campaigns:read'),
  [
    query('status').optional().isIn(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    const where = addTenantFilter(req, {});
    if (req.query.status) where.status = req.query.status;

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        include: {
          createdBy: { select: { id: true, name: true } },
          _count: { select: { steps: true, recipients: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.campaign.count({ where }),
    ]);

    return paginated(res, campaigns, page, limit, total);
  })
);

/**
 * @route   POST /api/v1/campaigns
 * @desc    Create campaign
 * @access  Private
 */
router.post(
  '/',
  requirePermission('campaigns:create'),
  [
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('type').isIn(['IMMEDIATE', 'SCHEDULED', 'SEQUENCE']),
    body('targetFilter').optional().isObject(),
    body('steps').optional().isArray(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name, type, targetFilter, steps } = req.body;
    const tenantId = getTenantId(req);

    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        name,
        type,
        targetFilter,
        createdById: req.user.id,
        steps: steps?.length ? {
          create: steps.map((step, idx) => ({
            stepOrder: idx + 1,
            channelType: step.channelType,
            channelConfigId: step.channelConfigId,
            templateId: step.templateId,
            delayDays: step.delayDays || 0,
            delayHours: step.delayHours || 0,
            sendTime: step.sendTime,
          })),
        } : undefined,
      },
      include: {
        steps: {
          include: {
            template: { select: { id: true, name: true } },
            channelConfig: { select: { id: true, name: true, channelType: true } },
          },
          orderBy: { stepOrder: 'asc' },
        },
      },
    });

    return created(res, campaign);
  })
);

/**
 * @route   GET /api/v1/campaigns/:id
 * @desc    Get campaign
 * @access  Private
 */
router.get(
  '/:id',
  requirePermission('campaigns:read'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: {
        createdBy: { select: { id: true, name: true } },
        steps: {
          include: {
            template: { select: { id: true, name: true, channelType: true } },
            channelConfig: { select: { id: true, name: true, channelType: true } },
          },
          orderBy: { stepOrder: 'asc' },
        },
        _count: { select: { recipients: true } },
      },
    });

    if (!campaign) throw AppError.notFound('Campaign not found');

    return success(res, campaign);
  })
);

/**
 * @route   PATCH /api/v1/campaigns/:id
 * @desc    Update campaign
 * @access  Private
 */
router.patch(
  '/:id',
  requirePermission('campaigns:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const { name, targetFilter } = req.body;

    const existing = await prisma.campaign.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) throw AppError.notFound('Campaign not found');

    if (existing.status !== 'DRAFT') {
      throw AppError.badRequest('Can only edit draft campaigns');
    }

    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(targetFilter && { targetFilter }),
      },
      include: { steps: true },
    });

    return success(res, campaign);
  })
);

/**
 * @route   DELETE /api/v1/campaigns/:id
 * @desc    Delete campaign
 * @access  Private
 */
router.delete(
  '/:id',
  requirePermission('campaigns:delete'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const existing = await prisma.campaign.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) throw AppError.notFound('Campaign not found');

    if (existing.status === 'ACTIVE') {
      throw AppError.badRequest('Cannot delete active campaign');
    }

    await prisma.campaign.delete({ where: { id: req.params.id } });

    return noContent(res);
  })
);

/**
 * @route   POST /api/v1/campaigns/:id/start
 * @desc    Start campaign
 * @access  Private
 */
router.post(
  '/:id/start',
  requirePermission('campaigns:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: { steps: true },
    });

    if (!campaign) throw AppError.notFound('Campaign not found');

    if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
      throw AppError.badRequest('Campaign cannot be started');
    }

    if (campaign.steps.length === 0) {
      throw AppError.badRequest('Campaign must have at least one step');
    }

    // TODO: Create recipients from target filter and queue first step jobs

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: {
        status: 'ACTIVE',
        startedAt: campaign.startedAt || new Date(),
      },
    });

    return success(res, { message: 'Campaign started', campaign: updated });
  })
);

/**
 * @route   POST /api/v1/campaigns/:id/pause
 * @desc    Pause campaign
 * @access  Private
 */
router.post(
  '/:id/pause',
  requirePermission('campaigns:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!campaign) throw AppError.notFound('Campaign not found');

    if (campaign.status !== 'ACTIVE') {
      throw AppError.badRequest('Only active campaigns can be paused');
    }

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: 'PAUSED' },
    });

    return success(res, { message: 'Campaign paused', campaign: updated });
  })
);

/**
 * @route   GET /api/v1/campaigns/:id/recipients
 * @desc    Get campaign recipients
 * @access  Private
 */
router.get(
  '/:id/recipients',
  requirePermission('campaigns:read'),
  [
    param('id').isInt().toInt(),
    query('status').optional(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    // Verify campaign belongs to tenant
    const campaign = await prisma.campaign.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!campaign) throw AppError.notFound('Campaign not found');

    const where = { campaignId: req.params.id };
    if (req.query.status) where.status = req.query.status;

    const [recipients, total] = await Promise.all([
      prisma.campaignRecipient.findMany({
        where,
        include: {
          lead: { select: { id: true, companyName: true } },
          contact: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.campaignRecipient.count({ where }),
    ]);

    return paginated(res, recipients, page, limit, total);
  })
);

/**
 * @route   GET /api/v1/campaigns/:id/analytics
 * @desc    Get campaign analytics
 * @access  Private
 */
router.get(
  '/:id/analytics',
  requirePermission('campaigns:read'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!campaign) throw AppError.notFound('Campaign not found');

    const [recipientStats, attemptStats] = await Promise.all([
      prisma.campaignRecipient.groupBy({
        by: ['status'],
        where: { campaignId: req.params.id },
        _count: true,
      }),
      prisma.contactAttempt.groupBy({
        by: ['status'],
        where: { campaignId: req.params.id },
        _count: true,
      }),
    ]);

    const totalRecipients = await prisma.campaignRecipient.count({
      where: { campaignId: req.params.id },
    });

    return success(res, {
      totalRecipients,
      byStatus: recipientStats.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {}),
      attemptsByStatus: attemptStats.reduce((acc, s) => {
        acc[s.status] = s._count;
        return acc;
      }, {}),
    });
  })
);

module.exports = router;
