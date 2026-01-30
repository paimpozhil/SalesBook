const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, getTenantId } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const { success, created, noContent } = require('../utils/response');
const logger = require('../utils/logger');
const whatsappProspectsService = require('../services/whatsappProspects.service');
const whatsappWebService = require('../services/whatsappWeb.service');
const prisma = require('../config/database');

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/whatsapp-prospects/groups
 * @desc    Get all WhatsApp prospect groups
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

    const groups = await whatsappProspectsService.getGroups(tenantId, channelConfigId);

    return success(res, groups);
  })
);

/**
 * @route   POST /api/v1/whatsapp-prospects/groups
 * @desc    Import prospects from WhatsApp group
 * @access  Private
 */
router.post(
  '/groups',
  requirePermission('sources:create'),
  [
    body('channelConfigId').notEmpty().isInt().toInt().withMessage('Channel config ID is required'),
    body('whatsappGroupId').notEmpty().withMessage('WhatsApp group ID is required'),
    body('whatsappGroupName').notEmpty().withMessage('WhatsApp group name is required'),
    body('contacts').isArray({ min: 1 }).withMessage('At least one contact is required'),
    body('customName').notEmpty().withMessage('Custom group name is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const { channelConfigId, whatsappGroupId, whatsappGroupName, contacts, customName } = req.body;

    const result = await whatsappProspectsService.importProspects(
      tenantId,
      channelConfigId,
      whatsappGroupId,
      whatsappGroupName,
      contacts,
      customName,
      req.user.id
    );

    return created(res, result);
  })
);

/**
 * @route   GET /api/v1/whatsapp-prospects/groups/:groupId
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

    const group = await whatsappProspectsService.getGroup(groupId, tenantId);

    return success(res, group);
  })
);

/**
 * @route   DELETE /api/v1/whatsapp-prospects/groups/:groupId
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

    await whatsappProspectsService.deleteGroup(groupId, tenantId);

    return noContent(res);
  })
);

/**
 * @route   GET /api/v1/whatsapp-prospects/groups/:groupId/prospects
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

    const result = await whatsappProspectsService.getProspects(groupId, tenantId, {
      page,
      limit,
      status,
      search,
    });

    return success(res, result.prospects, 200, { pagination: result.pagination });
  })
);

/**
 * @route   GET /api/v1/whatsapp-prospects/:prospectId/messages
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

    const messages = await whatsappProspectsService.getProspectMessages(prospectId, tenantId);

    return success(res, messages);
  })
);

/**
 * @route   POST /api/v1/whatsapp-prospects/:prospectId/convert
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

    const lead = await whatsappProspectsService.convertToLead(prospectId, tenantId, req.user.id);

    return created(res, lead);
  })
);

/**
 * @route   POST /api/v1/whatsapp-prospects/poll-replies
 * @desc    Manually trigger reply polling for a channel (limited support for WhatsApp Web)
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

    // Get channel config
    const channelConfig = await prisma.channelConfig.findFirst({
      where: { id: channelConfigId, tenantId, channelType: 'WHATSAPP_WEB' },
    });

    if (!channelConfig) {
      throw new Error('WhatsApp channel not found');
    }

    const autoConvert = channelConfig.settings?.autoConvert?.enabled || false;

    const result = await whatsappProspectsService.pollReplies(
      channelConfigId,
      tenantId,
      autoConvert
    );

    return success(res, result);
  })
);

/**
 * @route   GET /api/v1/whatsapp-prospects/whatsapp-groups
 * @desc    Get available WhatsApp groups from a connected channel
 * @access  Private
 */
router.get(
  '/whatsapp-groups',
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
      where: { id: channelConfigId, tenantId, channelType: 'WHATSAPP_WEB' },
    });

    if (!channelConfig) {
      throw new Error('WhatsApp channel not found');
    }

    // Check if connected
    const status = await whatsappWebService.getStatus(tenantId, channelConfig.id, false);
    if (status !== 'CONNECTED') {
      throw new Error('WhatsApp not connected. Please connect first.');
    }

    const groups = await whatsappWebService.getGroups(tenantId, channelConfig.id);

    return success(res, groups);
  })
);

/**
 * @route   GET /api/v1/whatsapp-prospects/whatsapp-groups/:groupId/contacts
 * @desc    Get contacts from a WhatsApp group
 * @access  Private
 */
router.get(
  '/whatsapp-groups/:groupId/contacts',
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
      where: { id: channelConfigId, tenantId, channelType: 'WHATSAPP_WEB' },
    });

    if (!channelConfig) {
      throw new Error('WhatsApp channel not found');
    }

    // Check if connected
    const status = await whatsappWebService.getStatus(tenantId, channelConfig.id, false);
    if (status !== 'CONNECTED') {
      throw new Error('WhatsApp not connected. Please connect first.');
    }

    const contacts = await whatsappWebService.getGroupMembers(tenantId, channelConfig.id, groupId);

    return success(res, contacts);
  })
);

module.exports = router;
