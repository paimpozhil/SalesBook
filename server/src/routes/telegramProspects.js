const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, getTenantId } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const { success, created, noContent } = require('../utils/response');
const logger = require('../utils/logger');
const telegramProspectsService = require('../services/telegramProspects.service');
const telegramService = require('../services/telegram.service');
const prisma = require('../config/database');
const { decrypt } = require('../utils/encryption');

/**
 * Helper to decrypt channel credentials
 */
function getDecryptedCredentials(channelConfig) {
  try {
    const encryptedData = channelConfig.credentials?.encrypted;
    if (encryptedData) {
      return JSON.parse(decrypt(encryptedData));
    } else if (channelConfig.credentials && typeof channelConfig.credentials === 'object') {
      return channelConfig.credentials;
    }
    throw new Error('No credentials found');
  } catch (error) {
    throw new Error('Failed to decrypt channel credentials');
  }
}

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/telegram-prospects/groups
 * @desc    Get all prospect groups
 * @access  Private
 */
router.get(
  '/groups',
  requirePermission('sources:read'),
  [
    query('channelConfigId').optional().isInt().toInt(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { channelConfigId } = req.query;

    const groups = await telegramProspectsService.getGroups(tenantId, channelConfigId);

    return success(res, groups);
  })
);

/**
 * @route   POST /api/v1/telegram-prospects/groups
 * @desc    Import prospects from Telegram group
 * @access  Private
 */
router.post(
  '/groups',
  requirePermission('sources:create'),
  [
    body('channelConfigId').notEmpty().isInt().toInt().withMessage('Channel config ID is required'),
    body('sessionKey').notEmpty().withMessage('Session key is required'),
    body('telegramGroupId').notEmpty().withMessage('Telegram group ID is required'),
    body('telegramGroupName').notEmpty().withMessage('Telegram group name is required'),
    body('contacts').isArray({ min: 1 }).withMessage('At least one contact is required'),
    body('customName').notEmpty().withMessage('Custom group name is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { channelConfigId, sessionKey, telegramGroupId, telegramGroupName, contacts, customName } = req.body;

    const result = await telegramProspectsService.importProspects(
      tenantId,
      channelConfigId,
      sessionKey,
      telegramGroupId,
      telegramGroupName,
      contacts,
      customName,
      req.user.id
    );

    return created(res, result);
  })
);

/**
 * @route   GET /api/v1/telegram-prospects/groups/:groupId
 * @desc    Get a single prospect group
 * @access  Private
 */
router.get(
  '/groups/:groupId',
  requirePermission('sources:read'),
  [
    param('groupId').isInt().toInt().withMessage('Group ID must be an integer'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { groupId } = req.params;

    const group = await telegramProspectsService.getGroup(groupId, tenantId);

    return success(res, group);
  })
);

/**
 * @route   DELETE /api/v1/telegram-prospects/groups/:groupId
 * @desc    Delete a prospect group
 * @access  Private
 */
router.delete(
  '/groups/:groupId',
  requirePermission('sources:delete'),
  [
    param('groupId').isInt().toInt().withMessage('Group ID must be an integer'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { groupId } = req.params;

    await telegramProspectsService.deleteGroup(groupId, tenantId);

    return noContent(res);
  })
);

/**
 * @route   GET /api/v1/telegram-prospects/groups/:groupId/prospects
 * @desc    Get prospects in a group
 * @access  Private
 */
router.get(
  '/groups/:groupId/prospects',
  requirePermission('sources:read'),
  [
    param('groupId').isInt().toInt().withMessage('Group ID must be an integer'),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['PENDING', 'MESSAGED', 'REPLIED', 'CONVERTED']),
    query('search').optional().isString(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { groupId } = req.params;
    const { page = 1, limit = 50, status, search } = req.query;

    const result = await telegramProspectsService.getProspects(groupId, tenantId, {
      page,
      limit,
      status,
      search,
    });

    return success(res, result.prospects, 200, { pagination: result.pagination });
  })
);

/**
 * @route   GET /api/v1/telegram-prospects/:prospectId/messages
 * @desc    Get messages for a prospect
 * @access  Private
 */
router.get(
  '/:prospectId/messages',
  requirePermission('sources:read'),
  [
    param('prospectId').isInt().toInt().withMessage('Prospect ID must be an integer'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { prospectId } = req.params;

    const messages = await telegramProspectsService.getProspectMessages(prospectId, tenantId);

    return success(res, messages);
  })
);

/**
 * @route   POST /api/v1/telegram-prospects/:prospectId/convert
 * @desc    Convert a prospect to a lead
 * @access  Private
 */
router.post(
  '/:prospectId/convert',
  requirePermission('leads:create'),
  [
    param('prospectId').isInt().toInt().withMessage('Prospect ID must be an integer'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { prospectId } = req.params;

    const lead = await telegramProspectsService.convertToLead(prospectId, tenantId, req.user.id);

    return created(res, lead);
  })
);

/**
 * @route   POST /api/v1/telegram-prospects/poll-replies
 * @desc    Manually trigger reply polling for a channel
 * @access  Private
 */
router.post(
  '/poll-replies',
  requirePermission('sources:read'),
  [
    body('channelConfigId').notEmpty().isInt().toInt().withMessage('Channel config ID is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { channelConfigId } = req.body;

    // Get channel config to get credentials
    const channelConfig = await prisma.channelConfig.findFirst({
      where: { id: channelConfigId, tenantId, channelType: 'TELEGRAM' },
    });

    if (!channelConfig) {
      throw new Error('Telegram channel not found');
    }

    const credentials = getDecryptedCredentials(channelConfig);
    const autoConvert = channelConfig.settings?.autoConvert?.enabled || false;

    const result = await telegramProspectsService.pollReplies(
      channelConfigId,
      credentials,
      tenantId,
      autoConvert
    );

    return success(res, result);
  })
);

/**
 * @route   GET /api/v1/telegram-prospects/telegram-groups
 * @desc    Get available Telegram groups from a connected channel
 * @access  Private
 */
router.get(
  '/telegram-groups',
  requirePermission('sources:read'),
  [
    query('channelConfigId').notEmpty().isInt().toInt().withMessage('Channel config ID is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { channelConfigId } = req.query;

    // Get channel config
    const channelConfig = await prisma.channelConfig.findFirst({
      where: { id: channelConfigId, tenantId, channelType: 'TELEGRAM' },
    });

    if (!channelConfig) {
      throw new Error('Telegram channel not found');
    }

    const credentials = getDecryptedCredentials(channelConfig);
    const { apiId, apiHash } = credentials;
    const sessionKey = telegramService.getSessionKey(tenantId, apiId);

    // Ensure connected
    let client = telegramService.getClient(sessionKey);
    if (!client) {
      await telegramService.reconnect(tenantId, apiId, apiHash);
    }

    const groups = await telegramService.getGroups(sessionKey);

    return success(res, groups);
  })
);

/**
 * @route   GET /api/v1/telegram-prospects/telegram-groups/:groupId/contacts
 * @desc    Get contacts from a Telegram group
 * @access  Private
 */
router.get(
  '/telegram-groups/:groupId/contacts',
  requirePermission('sources:read'),
  [
    param('groupId').notEmpty().withMessage('Group ID is required'),
    query('channelConfigId').notEmpty().isInt().toInt().withMessage('Channel config ID is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { groupId } = req.params;
    const { channelConfigId } = req.query;

    // Get channel config
    const channelConfig = await prisma.channelConfig.findFirst({
      where: { id: channelConfigId, tenantId, channelType: 'TELEGRAM' },
    });

    if (!channelConfig) {
      throw new Error('Telegram channel not found');
    }

    const credentials = getDecryptedCredentials(channelConfig);
    const { apiId, apiHash } = credentials;
    const sessionKey = telegramService.getSessionKey(tenantId, apiId);

    // Ensure connected
    let client = telegramService.getClient(sessionKey);
    if (!client) {
      await telegramService.reconnect(tenantId, apiId, apiHash);
    }

    const contacts = await telegramService.getGroupContacts(sessionKey, groupId);

    return success(res, contacts);
  })
);

module.exports = router;
