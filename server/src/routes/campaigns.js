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
        select: {
          id: true,
          name: true,
          status: true,
          type: true,
          startedAt: true,
          scheduledAt: true,
          completedAt: true,
          createdAt: true,
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

    // If steps provided, fetch channel configs to get channelType
    let stepsData = undefined;
    if (steps?.length) {
      const channelConfigIds = [...new Set(steps.map(s => s.channelConfigId))];
      const channelConfigs = await prisma.channelConfig.findMany({
        where: { id: { in: channelConfigIds } },
        select: { id: true, channelType: true },
      });
      const channelTypeMap = channelConfigs.reduce((acc, ch) => {
        acc[ch.id] = ch.channelType;
        return acc;
      }, {});

      stepsData = {
        create: steps.map((step, idx) => ({
          stepOrder: idx + 1,
          channelType: channelTypeMap[step.channelConfigId],
          channelConfigId: step.channelConfigId,
          templateId: step.templateId,
          delayDays: step.delayDays || 0,
          delayHours: step.delayHours || 0,
          delayMinutes: step.delayMinutes || 0,
          sendTime: step.sendTime,
        })),
      };
    }

    const campaign = await prisma.campaign.create({
      data: {
        tenantId,
        name,
        type,
        targetFilter,
        createdById: req.user.id,
        steps: stepsData,
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
 * @route   POST /api/v1/campaigns/:id/recipients
 * @desc    Add recipients to campaign (by leadIds, contactIds, or filters)
 * @access  Private
 */
router.post(
  '/:id/recipients',
  requirePermission('campaigns:update'),
  [
    param('id').isInt().toInt(),
    body('leadIds').optional().isArray(),
    body('contactIds').optional().isArray(),
    body('filters').optional().isObject(),
    body('primaryOnly').optional().isBoolean(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { leadIds, contactIds, filters, primaryOnly = false } = req.body;
    const tenantId = getTenantId(req);

    const campaign = await prisma.campaign.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!campaign) throw AppError.notFound('Campaign not found');

    if (campaign.status !== 'DRAFT') {
      throw AppError.badRequest('Can only add recipients to draft campaigns');
    }

    // If contactIds provided, add those specific contacts
    if (contactIds?.length) {
      const contacts = await prisma.contact.findMany({
        where: {
          id: { in: contactIds },
          lead: { tenantId },
        },
        include: { lead: true },
      });

      const recipientData = contacts.map((contact) => ({
        campaignId: campaign.id,
        leadId: contact.leadId,
        contactId: contact.id,
        status: 'PENDING',
        currentStep: 1,
      }));

      // Use createMany with skipDuplicates to avoid errors on re-adding
      await prisma.campaignRecipient.createMany({
        data: recipientData,
        skipDuplicates: true,
      });

      return success(res, { message: `Added ${contacts.length} recipients`, count: contacts.length });
    }

    // If leadIds provided, add contacts from those leads
    if (leadIds?.length) {
      const contactWhere = {
        leadId: { in: leadIds },
        lead: { tenantId },
      };
      if (primaryOnly) {
        contactWhere.isPrimary = true;
      }

      const contacts = await prisma.contact.findMany({ where: contactWhere });

      const recipientData = contacts.map((contact) => ({
        campaignId: campaign.id,
        leadId: contact.leadId,
        contactId: contact.id,
        status: 'PENDING',
        currentStep: 1,
      }));

      await prisma.campaignRecipient.createMany({
        data: recipientData,
        skipDuplicates: true,
      });

      const msg = primaryOnly
        ? `Added ${contacts.length} primary contacts from ${leadIds.length} leads`
        : `Added ${contacts.length} recipients from ${leadIds.length} leads`;
      return success(res, { message: msg, count: contacts.length });
    }

    // If filters provided, find leads matching filters and add their contacts
    if (filters && Object.keys(filters).length > 0) {
      const leadWhere = { tenantId, isDeleted: false };

      // Apply filters
      if (filters.status) {
        leadWhere.status = { in: Array.isArray(filters.status) ? filters.status : [filters.status] };
      }
      if (filters.industryIds?.length) {
        leadWhere.industries = { some: { industryId: { in: filters.industryIds } } };
      }
      if (filters.sourceId) {
        leadWhere.sourceId = filters.sourceId;
      }
      if (filters.size) {
        leadWhere.size = { in: Array.isArray(filters.size) ? filters.size : [filters.size] };
      }
      if (filters.search) {
        leadWhere.OR = [
          { companyName: { contains: filters.search } },
          { website: { contains: filters.search } },
        ];
      }

      // Find matching leads
      const matchingLeads = await prisma.lead.findMany({
        where: leadWhere,
        select: { id: true },
      });

      if (matchingLeads.length === 0) {
        return success(res, { message: 'No leads match the selected filters', count: 0, leadsMatched: 0 });
      }

      const matchingLeadIds = matchingLeads.map((l) => l.id);

      // Get contacts for those leads
      const contactWhere = {
        leadId: { in: matchingLeadIds },
        OR: [{ email: { not: null } }, { phone: { not: null } }],
      };
      if (primaryOnly) {
        contactWhere.isPrimary = true;
      }

      const contacts = await prisma.contact.findMany({ where: contactWhere });

      if (contacts.length === 0) {
        const msg = primaryOnly
          ? 'Matching leads have no primary contacts with email/phone'
          : 'Matching leads have no contacts with email/phone';
        return success(res, { message: msg, count: 0, leadsMatched: matchingLeads.length });
      }

      const recipientData = contacts.map((contact) => ({
        campaignId: campaign.id,
        leadId: contact.leadId,
        contactId: contact.id,
        status: 'PENDING',
        currentStep: 1,
      }));

      await prisma.campaignRecipient.createMany({
        data: recipientData,
        skipDuplicates: true,
      });

      const msg = primaryOnly
        ? `Added ${contacts.length} primary contacts from ${matchingLeads.length} matching leads`
        : `Added ${contacts.length} recipients from ${matchingLeads.length} matching leads`;
      return success(res, {
        message: msg,
        count: contacts.length,
        leadsMatched: matchingLeads.length,
      });
    }

    // If no specific IDs or filters, add all leads with contacts
    const allContactWhere = {
      lead: { tenantId, isDeleted: false },
      OR: [{ email: { not: null } }, { phone: { not: null } }],
    };
    if (primaryOnly) {
      allContactWhere.isPrimary = true;
    }

    const contacts = await prisma.contact.findMany({ where: allContactWhere });

    const recipientData = contacts.map((contact) => ({
      campaignId: campaign.id,
      leadId: contact.leadId,
      contactId: contact.id,
      status: 'PENDING',
      currentStep: 1,
    }));

    await prisma.campaignRecipient.createMany({
      data: recipientData,
      skipDuplicates: true,
    });

    const msg = primaryOnly
      ? `Added ${contacts.length} primary contacts (all leads)`
      : `Added ${contacts.length} recipients (all contacts)`;
    return success(res, { message: msg, count: contacts.length });
  })
);

/**
 * @route   DELETE /api/v1/campaigns/:id/recipients
 * @desc    Remove all recipients from campaign
 * @access  Private
 */
router.delete(
  '/:id/recipients',
  requirePermission('campaigns:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!campaign) throw AppError.notFound('Campaign not found');

    if (campaign.status !== 'DRAFT') {
      throw AppError.badRequest('Can only remove recipients from draft campaigns');
    }

    const deleted = await prisma.campaignRecipient.deleteMany({
      where: { campaignId: campaign.id },
    });

    return success(res, { message: `Removed ${deleted.count} recipients`, count: deleted.count });
  })
);

/**
 * @route   DELETE /api/v1/campaigns/:id/recipients/:recipientId
 * @desc    Remove a single recipient from campaign
 * @access  Private
 */
router.delete(
  '/:id/recipients/:recipientId',
  requirePermission('campaigns:update'),
  [
    param('id').isInt().toInt(),
    param('recipientId').isInt().toInt(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const campaign = await prisma.campaign.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!campaign) throw AppError.notFound('Campaign not found');

    if (campaign.status !== 'DRAFT') {
      throw AppError.badRequest('Can only remove recipients from draft campaigns');
    }

    const recipient = await prisma.campaignRecipient.findFirst({
      where: {
        id: req.params.recipientId,
        campaignId: campaign.id,
      },
    });

    if (!recipient) throw AppError.notFound('Recipient not found');

    await prisma.campaignRecipient.delete({
      where: { id: req.params.recipientId },
    });

    return success(res, { message: 'Recipient removed' });
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
  [
    param('id').isInt().toInt(),
    body('scheduledAt').optional().isISO8601(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { scheduledAt } = req.body;

    const campaign = await prisma.campaign.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
        _count: { select: { recipients: true } },
      },
    });

    if (!campaign) throw AppError.notFound('Campaign not found');

    if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
      throw AppError.badRequest('Campaign cannot be started');
    }

    if (campaign.steps.length === 0) {
      throw AppError.badRequest('Campaign must have at least one step');
    }

    if (campaign._count.recipients === 0) {
      throw AppError.badRequest('Campaign must have at least one recipient. Add recipients first.');
    }

    // Calculate nextActionAt based on campaign type
    let nextActionAt = new Date();

    if (campaign.type === 'SCHEDULED' && scheduledAt) {
      nextActionAt = new Date(scheduledAt);
    } else if (campaign.type === 'IMMEDIATE') {
      nextActionAt = new Date(); // Now
    }
    // For SEQUENCE, first step starts immediately, delays apply to subsequent steps

    // Update all pending recipients with nextActionAt
    await prisma.campaignRecipient.updateMany({
      where: {
        campaignId: campaign.id,
        status: 'PENDING',
      },
      data: {
        nextActionAt,
      },
    });

    const updateData = {
      status: 'ACTIVE',
      startedAt: campaign.startedAt || new Date(),
    };
    if (scheduledAt) {
      updateData.scheduledAt = new Date(scheduledAt);
    }

    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        _count: { select: { recipients: true, steps: true } },
      },
    });

    return success(res, {
      message: `Campaign started with ${campaign._count.recipients} recipients`,
      campaign: updated,
      recipientCount: campaign._count.recipients,
    });
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

    // Fetch contact attempts for these recipients to show step history
    const recipientIds = recipients.map((r) => ({ contactId: r.contactId, leadId: r.leadId }));
    const contactAttempts = await prisma.contactAttempt.findMany({
      where: {
        campaignId: req.params.id,
        OR: recipientIds,
      },
      include: {
        campaignStep: {
          select: { id: true, stepOrder: true },
        },
      },
      orderBy: { sentAt: 'asc' },
    });

    // Group attempts by contactId
    const attemptsByContact = {};
    contactAttempts.forEach((attempt) => {
      const key = attempt.contactId;
      if (!attemptsByContact[key]) {
        attemptsByContact[key] = [];
      }
      attemptsByContact[key].push({
        stepOrder: attempt.campaignStep?.stepOrder,
        status: attempt.status,
        sentAt: attempt.sentAt,
        subject: attempt.subject,
      });
    });

    // Attach attempts to recipients
    const recipientsWithHistory = recipients.map((r) => ({
      ...r,
      stepHistory: attemptsByContact[r.contactId] || [],
    }));

    return paginated(res, recipientsWithHistory, page, limit, total);
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
