const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, addTenantFilter, getTenantId } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { success, created } = require('../utils/response');
const logger = require('../utils/logger');
const telegramService = require('../services/telegram.service');

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   POST /api/v1/telegram/auth/start
 * @desc    Start Telegram authentication - send code to phone
 * @access  Private
 */
router.post(
  '/auth/start',
  requirePermission('sources:create'),
  [
    body('apiId').notEmpty().withMessage('API ID is required'),
    body('apiHash').notEmpty().withMessage('API Hash is required'),
    body('phoneNumber').notEmpty().withMessage('Phone number is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { apiId, apiHash, phoneNumber } = req.body;
    const tenantId = getTenantId(req);

    const result = await telegramService.startAuth(tenantId, apiId, apiHash, phoneNumber);

    return success(res, {
      ...result,
      message: result.status === 'authorized'
        ? 'Already authenticated'
        : 'Verification code sent to your Telegram',
    });
  })
);

/**
 * @route   POST /api/v1/telegram/auth/verify-code
 * @desc    Verify the code sent to Telegram
 * @access  Private
 */
router.post(
  '/auth/verify-code',
  requirePermission('sources:create'),
  [
    body('sessionKey').notEmpty().withMessage('Session key is required'),
    body('code').notEmpty().withMessage('Verification code is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { sessionKey, code } = req.body;

    const result = await telegramService.verifyCode(sessionKey, code);

    let message = 'Authentication successful';
    if (result.status === 'password_required') {
      message = 'Two-factor authentication required. Please enter your password.';
    }

    return success(res, { ...result, message });
  })
);

/**
 * @route   POST /api/v1/telegram/auth/verify-password
 * @desc    Verify 2FA password
 * @access  Private
 */
router.post(
  '/auth/verify-password',
  requirePermission('sources:create'),
  [
    body('sessionKey').notEmpty().withMessage('Session key is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { sessionKey, password } = req.body;

    const result = await telegramService.verifyPassword(sessionKey, password);

    return success(res, {
      ...result,
      message: 'Authentication successful',
    });
  })
);

/**
 * @route   GET /api/v1/telegram/groups
 * @desc    Get list of groups the user is member of
 * @access  Private
 */
router.get(
  '/groups',
  requirePermission('sources:read'),
  [
    query('sessionKey').notEmpty().withMessage('Session key is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { sessionKey } = req.query;

    const groups = await telegramService.getGroups(sessionKey);

    return success(res, groups);
  })
);

/**
 * @route   GET /api/v1/telegram/groups/:groupId/contacts
 * @desc    Get contacts/participants from a group
 * @access  Private
 */
router.get(
  '/groups/:groupId/contacts',
  requirePermission('sources:read'),
  [
    param('groupId').notEmpty().withMessage('Group ID is required'),
    query('sessionKey').notEmpty().withMessage('Session key is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { sessionKey } = req.query;

    const contacts = await telegramService.getGroupContacts(sessionKey, groupId);

    return success(res, contacts);
  })
);

/**
 * @route   POST /api/v1/telegram/import
 * @desc    Import contacts from Telegram group as data source
 * @access  Private
 */
router.post(
  '/import',
  requirePermission('sources:create'),
  [
    body('sessionKey').notEmpty().withMessage('Session key is required'),
    body('groupId').notEmpty().withMessage('Group ID is required'),
    body('groupName').notEmpty().withMessage('Group name is required'),
    body('contacts').isArray({ min: 1 }).withMessage('At least one contact is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { sessionKey, groupId, groupName, contacts } = req.body;
    const tenantId = getTenantId(req);

    // Create data source for tracking
    const dataSource = await prisma.dataSource.create({
      data: {
        name: `Telegram: ${groupName}`,
        type: 'MANUAL',
        tenantId,
        isActive: true,
        recordCount: contacts.length,
        lastStatus: 'SUCCESS',
        lastRunAt: new Date(),
        config: {
          source: 'telegram',
          groupId,
          groupName,
        },
        createdById: req.user.id,
      },
    });

    // Create leads and contacts from Telegram contacts
    let importedCount = 0;

    for (const contact of contacts) {
      const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.username || 'Unknown';

      // Create lead (company name is the person's name for individual contacts)
      const lead = await prisma.lead.create({
        data: {
          tenantId,
          companyName: contactName,
          sourceId: dataSource.id,
          status: 'NEW',
          customFields: {
            telegramId: contact.id,
            telegramUsername: contact.username,
            telegramAccessHash: contact.accessHash,
            importSource: 'telegram',
            groupId,
            groupName,
          },
          createdById: req.user.id,
        },
      });

      // Create contact linked to lead
      await prisma.contact.create({
        data: {
          tenantId,
          leadId: lead.id,
          name: contactName,
          phone: contact.phone || null,
          source: 'telegram',
          isPrimary: true,
        },
      });

      importedCount++;
    }

    logger.info(`Imported ${importedCount} contacts from Telegram group: ${groupName}`);

    return created(res, {
      dataSource: {
        id: dataSource.id,
        name: dataSource.name,
      },
      importedCount,
      totalContacts: contacts.length,
    });
  })
);

/**
 * @route   POST /api/v1/telegram/disconnect
 * @desc    Disconnect Telegram session
 * @access  Private
 */
router.post(
  '/disconnect',
  requirePermission('sources:create'),
  [
    body('sessionKey').notEmpty().withMessage('Session key is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { sessionKey } = req.body;

    await telegramService.disconnect(sessionKey);

    return success(res, { message: 'Disconnected successfully' });
  })
);

/**
 * @route   GET /api/v1/telegram/status
 * @desc    Check if session is authorized
 * @access  Private
 */
router.get(
  '/status',
  requirePermission('sources:read'),
  [
    query('sessionKey').notEmpty().withMessage('Session key is required'),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { sessionKey } = req.query;

    const status = await telegramService.isAuthorized(sessionKey);

    return success(res, status);
  })
);

module.exports = router;
