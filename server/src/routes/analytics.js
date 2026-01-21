const express = require('express');
const { query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, addTenantFilter, getTenantId } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const { success } = require('../utils/response');

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/analytics/overview
 * @desc    Dashboard overview
 * @access  Private
 */
router.get(
  '/overview',
  requirePermission('analytics:read'),
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalLeads,
      newLeadsThisMonth,
      activeLeads,
      totalContacts,
      activeCampaigns,
      totalSent,
    ] = await Promise.all([
      prisma.lead.count({
        where: addTenantFilter(req, { isDeleted: false }),
      }),
      prisma.lead.count({
        where: addTenantFilter(req, {
          isDeleted: false,
          createdAt: { gte: thirtyDaysAgo },
        }),
      }),
      prisma.lead.count({
        where: addTenantFilter(req, {
          isDeleted: false,
          status: { in: ['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATION'] },
        }),
      }),
      prisma.contact.count({
        where: addTenantFilter(req, {}),
      }),
      prisma.campaign.count({
        where: addTenantFilter(req, { status: 'ACTIVE' }),
      }),
      prisma.contactAttempt.count({
        where: addTenantFilter(req, {
          createdAt: { gte: thirtyDaysAgo },
        }),
      }),
    ]);

    // Lead status distribution
    const leadsByStatus = await prisma.lead.groupBy({
      by: ['status'],
      where: addTenantFilter(req, { isDeleted: false }),
      _count: true,
    });

    return success(res, {
      totalLeads,
      newLeadsThisMonth,
      activeLeads,
      totalContacts,
      activeCampaigns,
      totalSentLast30Days: totalSent,
      leadsByStatus: leadsByStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {}),
    });
  })
);

/**
 * @route   GET /api/v1/analytics/channels
 * @desc    Channel performance
 * @access  Private
 */
router.get(
  '/channels',
  requirePermission('analytics:read'),
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const startDate = req.query.startDate
      ? new Date(req.query.startDate)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = await prisma.contactAttempt.groupBy({
      by: ['channelType', 'status'],
      where: addTenantFilter(req, {
        createdAt: { gte: startDate, lte: endDate },
      }),
      _count: true,
    });

    // Organize by channel type
    const byChannel = {};
    stats.forEach((stat) => {
      if (!byChannel[stat.channelType]) {
        byChannel[stat.channelType] = { total: 0 };
      }
      byChannel[stat.channelType][stat.status] = stat._count;
      byChannel[stat.channelType].total += stat._count;
    });

    return success(res, {
      period: { startDate, endDate },
      byChannel,
    });
  })
);

/**
 * @route   GET /api/v1/analytics/campaigns
 * @desc    Campaign performance
 * @access  Private
 */
router.get(
  '/campaigns',
  requirePermission('analytics:read'),
  asyncHandler(async (req, res) => {
    const campaigns = await prisma.campaign.findMany({
      where: addTenantFilter(req, {
        status: { in: ['ACTIVE', 'COMPLETED'] },
      }),
      select: {
        id: true,
        name: true,
        status: true,
        type: true,
        startedAt: true,
        completedAt: true,
        _count: { select: { recipients: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    // Get recipient stats for each campaign
    const campaignStats = await Promise.all(
      campaigns.map(async (campaign) => {
        const recipientStats = await prisma.campaignRecipient.groupBy({
          by: ['status'],
          where: { campaignId: campaign.id },
          _count: true,
        });

        return {
          ...campaign,
          recipientStats: recipientStats.reduce((acc, s) => {
            acc[s.status] = s._count;
            return acc;
          }, {}),
        };
      })
    );

    return success(res, campaignStats);
  })
);

/**
 * @route   GET /api/v1/analytics/sources
 * @desc    Data source effectiveness
 * @access  Private
 */
router.get(
  '/sources',
  requirePermission('analytics:read'),
  asyncHandler(async (req, res) => {
    const sources = await prisma.dataSource.findMany({
      where: addTenantFilter(req, {}),
      select: {
        id: true,
        name: true,
        type: true,
        isActive: true,
        lastRunAt: true,
        lastStatus: true,
        _count: { select: { leads: true, runs: true } },
      },
    });

    // Get recent run stats
    const sourceStats = await Promise.all(
      sources.map(async (source) => {
        const recentRuns = await prisma.dataSourceRun.findMany({
          where: { dataSourceId: source.id },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            status: true,
            leadsFound: true,
            leadsCreated: true,
            completedAt: true,
          },
        });

        return {
          ...source,
          recentRuns,
        };
      })
    );

    return success(res, sourceStats);
  })
);

module.exports = router;
