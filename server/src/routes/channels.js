const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, addTenantFilter, getTenantId } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const { encrypt, decrypt } = require('../utils/encryption');
const AppError = require('../utils/AppError');
const { success, paginated, noContent, created } = require('../utils/response');

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/channels
 * @desc    List channel configurations
 * @access  Private
 */
router.get(
  '/',
  requirePermission('channels:read'),
  [
    query('channelType').optional().isIn([
      'EMAIL_SMTP', 'EMAIL_API', 'SMS', 'WHATSAPP_WEB',
      'WHATSAPP_BUSINESS', 'TELEGRAM', 'VOICE'
    ]),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const where = addTenantFilter(req, {});
    if (req.query.channelType) where.channelType = req.query.channelType;

    const channels = await prisma.channelConfig.findMany({
      where,
      select: {
        id: true,
        channelType: true,
        provider: true,
        name: true,
        settings: true,
        isActive: true,
        createdAt: true,
        // Don't return credentials
      },
      orderBy: { createdAt: 'desc' },
    });

    return success(res, channels);
  })
);

/**
 * @route   POST /api/v1/channels
 * @desc    Create channel config
 * @access  Private (Admin)
 */
router.post(
  '/',
  requirePermission('channels:create'),
  [
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('channelType').isIn([
      'EMAIL_SMTP', 'EMAIL_API', 'SMS', 'WHATSAPP_WEB',
      'WHATSAPP_BUSINESS', 'TELEGRAM', 'VOICE'
    ]),
    body('provider').trim().isLength({ min: 1, max: 50 }),
    body('credentials').isObject(),
    body('settings').optional().isObject(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name, channelType, provider, credentials, settings } = req.body;

    // Encrypt credentials before storing
    const encryptedCredentials = encrypt(JSON.stringify(credentials));

    const channel = await prisma.channelConfig.create({
      data: {
        tenantId: getTenantId(req),
        name,
        channelType,
        provider,
        credentials: { encrypted: encryptedCredentials },
        settings: settings || {},
      },
      select: {
        id: true,
        channelType: true,
        provider: true,
        name: true,
        settings: true,
        isActive: true,
        createdAt: true,
      },
    });

    return created(res, channel);
  })
);

/**
 * @route   GET /api/v1/channels/:id
 * @desc    Get channel config
 * @access  Private
 */
router.get(
  '/:id',
  requirePermission('channels:read'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const channel = await prisma.channelConfig.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      select: {
        id: true,
        channelType: true,
        provider: true,
        name: true,
        settings: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!channel) throw AppError.notFound('Channel config not found');

    return success(res, channel);
  })
);

/**
 * @route   PATCH /api/v1/channels/:id
 * @desc    Update channel config
 * @access  Private (Admin)
 */
router.patch(
  '/:id',
  requirePermission('channels:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const { name, credentials, settings, isActive } = req.body;

    const existing = await prisma.channelConfig.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) throw AppError.notFound('Channel config not found');

    const updateData = {};
    if (name) updateData.name = name;
    if (settings) updateData.settings = settings;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (credentials) {
      updateData.credentials = { encrypted: encrypt(JSON.stringify(credentials)) };
    }

    const channel = await prisma.channelConfig.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        channelType: true,
        provider: true,
        name: true,
        settings: true,
        isActive: true,
        updatedAt: true,
      },
    });

    return success(res, channel);
  })
);

/**
 * @route   DELETE /api/v1/channels/:id
 * @desc    Delete channel config
 * @access  Private (Admin)
 */
router.delete(
  '/:id',
  requirePermission('channels:delete'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const existing = await prisma.channelConfig.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) throw AppError.notFound('Channel config not found');

    await prisma.channelConfig.delete({ where: { id: req.params.id } });

    return noContent(res);
  })
);

/**
 * @route   POST /api/v1/channels/:id/test
 * @desc    Test channel configuration
 * @access  Private (Admin)
 */
router.post(
  '/:id/test',
  requirePermission('channels:update'),
  [
    param('id').isInt().toInt(),
    body('recipient').notEmpty(),
    body('message').optional(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { recipient, message } = req.body;

    const channel = await prisma.channelConfig.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!channel) throw AppError.notFound('Channel config not found');

    // TODO: Implement actual channel testing based on type
    // For now, return a mock response
    return success(res, {
      success: true,
      message: 'Test message sent (mock)',
      channelType: channel.channelType,
      recipient,
    });
  })
);

module.exports = router;
