const express = require('express');
const { param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, addTenantFilter } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { success, paginated } = require('../utils/response');

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/conversations
 * @desc    List conversations
 * @access  Private
 */
router.get(
  '/',
  requirePermission('leads:read'),
  [
    query('status').optional().isIn(['OPEN', 'CLOSED']),
    query('channelType').optional(),
    query('leadId').optional().isInt().toInt(),
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
    if (req.query.channelType) where.channelType = req.query.channelType;
    if (req.query.leadId) where.leadId = req.query.leadId;

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          lead: { select: { id: true, companyName: true } },
          contact: { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true } },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.conversation.count({ where }),
    ]);

    return paginated(res, conversations, page, limit, total);
  })
);

/**
 * @route   GET /api/v1/conversations/:id
 * @desc    Get conversation with messages
 * @access  Private
 */
router.get(
  '/:id',
  requirePermission('leads:read'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: {
        lead: { select: { id: true, companyName: true } },
        contact: { select: { id: true, name: true, email: true, phone: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    if (!conversation) throw AppError.notFound('Conversation not found');

    return success(res, conversation);
  })
);

/**
 * @route   GET /api/v1/conversations/:id/messages
 * @desc    Get messages in conversation
 * @access  Private
 */
router.get(
  '/:id/messages',
  requirePermission('leads:read'),
  [
    param('id').isInt().toInt(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 50;
    const skip = (page - 1) * limit;

    // Verify conversation belongs to tenant
    const conversation = await prisma.conversation.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!conversation) throw AppError.notFound('Conversation not found');

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: req.params.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.message.count({ where: { conversationId: req.params.id } }),
    ]);

    // Reverse to show oldest first
    return paginated(res, messages.reverse(), page, limit, total);
  })
);

/**
 * @route   PATCH /api/v1/conversations/:id
 * @desc    Update conversation status
 * @access  Private
 */
router.patch(
  '/:id',
  requirePermission('leads:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const { status } = req.body;

    if (status && !['OPEN', 'CLOSED'].includes(status)) {
      throw AppError.badRequest('Invalid status. Must be OPEN or CLOSED');
    }

    const conversation = await prisma.conversation.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!conversation) throw AppError.notFound('Conversation not found');

    const updated = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        lead: { select: { id: true, companyName: true } },
        contact: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    return success(res, updated);
  })
);

/**
 * @route   POST /api/v1/conversations/:id/messages
 * @desc    Send reply in conversation
 * @access  Private
 */
router.post(
  '/:id/messages',
  requirePermission('leads:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const { content, channelConfigId } = req.body;

    const conversation = await prisma.conversation.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!conversation) throw AppError.notFound('Conversation not found');

    // Create message
    const message = await prisma.message.create({
      data: {
        conversationId: req.params.id,
        direction: 'OUTBOUND',
        content,
      },
    });

    // Update conversation
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { lastMessageAt: new Date() },
    });

    // TODO: Actually send the message via the channel

    return success(res, message, 201);
  })
);

module.exports = router;
