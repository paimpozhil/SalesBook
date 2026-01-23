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
const industryService = require('../services/industry.service');

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/leads
 * @desc    List leads with filtering
 * @access  Private
 */
router.get(
  '/',
  requirePermission('leads:read'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional(),
    query('industryId').optional(),
    query('size').optional(),
    query('search').optional().trim(),
    query('sourceId').optional().isInt().toInt(),
    query('assignedTo').optional().isInt().toInt(),
    query('includeDeleted').optional().isIn(['true', 'false', 'only']),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    // Handle deleted filter: 'true' = include all, 'only' = only deleted, default = exclude deleted
    let deletedFilter = { isDeleted: false };
    if (req.query.includeDeleted === 'true') {
      deletedFilter = {}; // Include all
    } else if (req.query.includeDeleted === 'only') {
      deletedFilter = { isDeleted: true }; // Only deleted
    }

    const where = addTenantFilter(req, deletedFilter);

    // Filters
    if (req.query.status) {
      where.status = { in: req.query.status.split(',') };
    }
    if (req.query.industryId) {
      const industryIds = req.query.industryId.split(',').map(id => parseInt(id, 10));
      where.industries = { some: { industryId: { in: industryIds } } };
    }
    if (req.query.size) {
      where.size = { in: req.query.size.split(',') };
    }
    if (req.query.sourceId) {
      where.sourceId = req.query.sourceId;
    }
    if (req.query.assignedTo) {
      where.assignedToId = req.query.assignedTo;
    }
    if (req.query.search) {
      where.OR = [
        { companyName: { contains: req.query.search } },
        { website: { contains: req.query.search } },
        { contacts: { some: { email: { contains: req.query.search } } } },
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          contacts: {
            where: { isPrimary: true },
            take: 1,
          },
          source: {
            select: { id: true, name: true },
          },
          assignedTo: {
            select: { id: true, name: true },
          },
          industries: {
            include: { industry: true },
          },
          _count: {
            select: { contacts: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.lead.count({ where }),
    ]);

    return paginated(res, leads, page, limit, total);
  })
);

/**
 * @route   POST /api/v1/leads
 * @desc    Create a new lead
 * @access  Private
 */
router.post(
  '/',
  requirePermission('leads:create'),
  [
    body('companyName').trim().isLength({ min: 1, max: 255 }).withMessage('Company name required'),
    body('website').optional({ values: 'falsy' }).isURL(),
    body('industryIds').optional().isArray(),
    body('industryIds.*').optional().isInt(),
    body('size').optional({ nullable: true }).isIn(['MICRO', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']),
    body('status').optional().isIn(['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATION', 'CONVERTED', 'LOST']),
    body('tags').optional().isArray(),
    body('contacts').optional().isArray(),
    body('contacts.*.name').optional({ values: 'falsy' }).trim(),
    body('contacts.*.email').optional({ values: 'falsy' }).isEmail(),
    body('contacts.*.phone').optional({ values: 'falsy' }),
    body('contacts.*.position').optional({ values: 'falsy' }),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { companyName, website, industryIds, size, status, tags, contacts, customFields } = req.body;
    const tenantId = getTenantId(req);

    const lead = await prisma.lead.create({
      data: {
        tenantId,
        companyName,
        website: website || null,
        size,
        status: status || 'NEW',
        tags: tags || [],
        customFields: customFields || {},
        createdById: req.user.id,
        contacts: contacts?.length ? {
          create: contacts.map((c, idx) => ({
            tenantId,
            name: c.name,
            email: c.email,
            phone: c.phone,
            position: c.position,
            isPrimary: idx === 0,
          })),
        } : undefined,
      },
      include: {
        contacts: true,
        industries: { include: { industry: true } },
      },
    });

    // Link industries if provided
    if (industryIds && industryIds.length > 0) {
      await industryService.linkIndustriesToLead(lead.id, industryIds);
    }

    // Refetch to get industries
    const updatedLead = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: {
        contacts: true,
        industries: { include: { industry: true } },
      },
    });

    return created(res, updatedLead);
  })
);

/**
 * @route   GET /api/v1/leads/:id
 * @desc    Get lead by ID
 * @access  Private
 */
router.get(
  '/:id',
  requirePermission('leads:read'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findFirst({
      where: addTenantFilter(req, { id: req.params.id, isDeleted: false }),
      include: {
        contacts: true,
        source: { select: { id: true, name: true, type: true } },
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        industries: { include: { industry: true } },
        _count: {
          select: {
            contactAttempts: true,
            conversations: true,
          },
        },
      },
    });

    if (!lead) {
      throw AppError.notFound('Lead not found');
    }

    return success(res, lead);
  })
);

/**
 * @route   PATCH /api/v1/leads/:id
 * @desc    Update lead
 * @access  Private
 */
router.patch(
  '/:id',
  requirePermission('leads:update'),
  [
    param('id').isInt().toInt(),
    body('companyName').optional().trim().isLength({ min: 1, max: 255 }),
    body('status').optional().isIn(['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATION', 'CONVERTED', 'LOST']),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { companyName, website, industryIds, size, status, tags, customFields, assignedToId } = req.body;

    // Verify lead exists
    const existing = await prisma.lead.findFirst({
      where: addTenantFilter(req, { id: req.params.id, isDeleted: false }),
    });

    if (!existing) {
      throw AppError.notFound('Lead not found');
    }

    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        ...(companyName && { companyName }),
        ...(website !== undefined && { website }),
        ...(size !== undefined && { size }),
        ...(status && { status }),
        ...(tags && { tags }),
        ...(customFields && { customFields }),
        ...(assignedToId !== undefined && { assignedToId }),
      },
      include: {
        contacts: true,
        industries: { include: { industry: true } },
      },
    });

    // Update industries if provided
    if (industryIds !== undefined) {
      await industryService.linkIndustriesToLead(lead.id, industryIds || []);
    }

    // Refetch to get updated industries
    const updatedLead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: {
        contacts: true,
        industries: { include: { industry: true } },
      },
    });

    return success(res, updatedLead);
  })
);

/**
 * @route   DELETE /api/v1/leads/:id
 * @desc    Soft delete lead
 * @access  Private
 */
router.delete(
  '/:id',
  requirePermission('leads:delete'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const existing = await prisma.lead.findFirst({
      where: addTenantFilter(req, { id: req.params.id, isDeleted: false }),
    });

    if (!existing) {
      throw AppError.notFound('Lead not found');
    }

    await prisma.lead.update({
      where: { id: req.params.id },
      data: { isDeleted: true },
    });

    return noContent(res);
  })
);

/**
 * @route   POST /api/v1/leads/bulk
 * @desc    Bulk actions on leads
 * @access  Private
 */
router.post(
  '/bulk',
  requirePermission('leads:update'),
  [
    body('action').isIn(['update_status', 'add_tags', 'remove_tags', 'assign', 'delete']),
    body('leadIds').isArray({ min: 1, max: 1000 }),
    body('leadIds.*').isInt(),
    body('data').optional().isObject(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { action, leadIds, data } = req.body;
    const tenantId = getTenantId(req);

    // Verify all leads belong to tenant
    const count = await prisma.lead.count({
      where: {
        id: { in: leadIds },
        tenantId,
        isDeleted: false,
      },
    });

    if (count !== leadIds.length) {
      throw AppError.badRequest('Some leads not found or access denied');
    }

    let result;

    switch (action) {
      case 'update_status':
        result = await prisma.lead.updateMany({
          where: { id: { in: leadIds }, tenantId },
          data: { status: data.status },
        });
        break;

      case 'assign':
        result = await prisma.lead.updateMany({
          where: { id: { in: leadIds }, tenantId },
          data: { assignedToId: data.assignedToId },
        });
        break;

      case 'delete':
        result = await prisma.lead.updateMany({
          where: { id: { in: leadIds }, tenantId },
          data: { isDeleted: true },
        });
        break;

      default:
        throw AppError.badRequest('Invalid action');
    }

    return success(res, { affected: result.count });
  })
);

module.exports = router;
