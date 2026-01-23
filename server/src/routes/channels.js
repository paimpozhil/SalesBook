const express = require('express');
const { body, param, query } = require('express-validator');
const nodemailer = require('nodemailer');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, addTenantFilter, getTenantId } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const { encrypt, decrypt } = require('../utils/encryption');
const AppError = require('../utils/AppError');
const { success, paginated, noContent, created } = require('../utils/response');
const logger = require('../utils/logger');

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

    // Decrypt credentials
    let credentials;
    try {
      const encryptedData = channel.credentials?.encrypted;
      if (encryptedData) {
        credentials = JSON.parse(decrypt(encryptedData));
      } else {
        throw new Error('No credentials found');
      }
    } catch (error) {
      throw AppError.badRequest('Failed to decrypt channel credentials');
    }

    // Handle different channel types
    if (channel.channelType === 'EMAIL_SMTP') {
      try {
        const transporter = nodemailer.createTransport({
          host: credentials.host,
          port: parseInt(credentials.port) || 587,
          secure: credentials.secure === true || credentials.secure === 'true',
          auth: {
            user: credentials.user,
            pass: credentials.pass,
          },
        });

        // Verify connection first
        await transporter.verify();

        // Send test email
        const fromAddress = credentials.fromEmail
          ? `${credentials.fromName || 'SalesBook'} <${credentials.fromEmail}>`
          : credentials.user;

        const result = await transporter.sendMail({
          from: fromAddress,
          to: recipient,
          subject: 'SalesBook - Test Email',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Test Email from SalesBook</h2>
              <p>This is a test email to verify your email channel configuration.</p>
              <p>Channel: <strong>${channel.name}</strong></p>
              <p>Time: ${new Date().toLocaleString()}</p>
              ${message ? `<p>Message: ${message}</p>` : ''}
              <hr>
              <p style="color: #666; font-size: 12px;">If you received this email, your channel is configured correctly!</p>
            </div>
          `,
        });

        logger.info('Test email sent', { channelId: channel.id, recipient, messageId: result.messageId });

        return success(res, {
          success: true,
          message: 'Test email sent successfully',
          messageId: result.messageId,
          channelType: channel.channelType,
          recipient,
        });
      } catch (error) {
        logger.error('Failed to send test email', { channelId: channel.id, error: error.message });
        throw AppError.badRequest(`Failed to send test email: ${error.message}`);
      }
    } else if (channel.channelType === 'EMAIL_API') {
      // For API-based email (SendGrid, Mandrill, etc.)
      throw AppError.badRequest(`Email API testing not yet implemented for provider: ${credentials.provider}`);
    } else if (channel.channelType === 'WHATSAPP_BUSINESS') {
      // Test WhatsApp Business API
      const phoneNumber = recipient.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');

      try {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${credentials.phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${credentials.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phoneNumber,
              type: 'text',
              text: { body: message || `Test message from SalesBook - ${channel.name}. Time: ${new Date().toLocaleString()}` },
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error?.message || 'WhatsApp API error');
        }

        logger.info('Test WhatsApp sent', { channelId: channel.id, recipient: phoneNumber });

        return success(res, {
          success: true,
          message: 'Test WhatsApp message sent successfully',
          messageId: result.messages?.[0]?.id,
          channelType: channel.channelType,
          recipient: phoneNumber,
        });
      } catch (error) {
        logger.error('Failed to send test WhatsApp', { channelId: channel.id, error: error.message });
        throw AppError.badRequest(`Failed to send test WhatsApp: ${error.message}`);
      }
    } else if (channel.channelType === 'VOICE') {
      // Test Twilio Voice call
      let phoneNumber = recipient.replace(/[\s\-\(\)]/g, '');
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+' + phoneNumber;
      }

      // Validate Twilio credentials
      if (!credentials.accountSid || !credentials.authToken || !credentials.fromNumber) {
        throw AppError.badRequest('Missing Twilio credentials');
      }

      if (!credentials.accountSid.startsWith('AC')) {
        throw AppError.badRequest('Invalid Twilio Account SID. Should start with "AC".');
      }

      try {
        const authString = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64');
        const twiml = `<Response><Say voice="alice">This is a test call from SalesBook channel ${channel.name.replace(/[<>&'"]/g, '')}. Your voice channel is configured correctly.</Say></Response>`;

        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Calls.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${authString}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: phoneNumber,
              From: credentials.fromNumber,
              Twiml: twiml,
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Twilio API error');
        }

        logger.info('Test voice call initiated', { channelId: channel.id, recipient: phoneNumber, callSid: result.sid });

        return success(res, {
          success: true,
          message: 'Test call initiated successfully',
          callSid: result.sid,
          channelType: channel.channelType,
          recipient: phoneNumber,
        });
      } catch (error) {
        logger.error('Failed to initiate test call', { channelId: channel.id, error: error.message });
        throw AppError.badRequest(`Failed to initiate test call: ${error.message}`);
      }
    } else {
      // For other channel types (SMS, Telegram, etc.)
      throw AppError.badRequest(`Testing not yet implemented for channel type: ${channel.channelType}`);
    }
  })
);

/**
 * @route   POST /api/v1/channels/:id/send
 * @desc    Send message to a contact using channel (Email or WhatsApp)
 * @access  Private
 */
router.post(
  '/:id/send',
  requirePermission('channels:read'),
  [
    param('id').isInt().toInt(),
    body('contactId').isInt().toInt(),
    body('leadId').isInt().toInt(),
    body('subject').optional().trim().isLength({ max: 500 }),
    body('body').optional().trim(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { contactId, leadId, subject, body: messageBody } = req.body;
    const tenantId = getTenantId(req);

    // Get channel
    const channel = await prisma.channelConfig.findFirst({
      where: addTenantFilter(req, { id: req.params.id, isActive: true }),
    });

    if (!channel) throw AppError.notFound('Channel not found or inactive');

    // Verify it's a supported channel type
    const supportedTypes = ['EMAIL_SMTP', 'EMAIL_API', 'WHATSAPP_BUSINESS', 'VOICE'];
    if (!supportedTypes.includes(channel.channelType)) {
      throw AppError.badRequest(`Sending not supported for channel type: ${channel.channelType}`);
    }

    // Body is required for email and WhatsApp, optional for voice
    if (['EMAIL_SMTP', 'EMAIL_API', 'WHATSAPP_BUSINESS'].includes(channel.channelType) && !messageBody) {
      throw AppError.badRequest('Message body is required');
    }

    // Get contact
    const contact = await prisma.contact.findFirst({
      where: { id: contactId },
      include: { lead: true },
    });

    if (!contact) throw AppError.notFound('Contact not found');

    // Decrypt credentials
    let credentials;
    try {
      const encryptedData = channel.credentials?.encrypted;
      if (encryptedData) {
        credentials = JSON.parse(decrypt(encryptedData));
        logger.debug('Channel credentials decrypted', {
          channelId: channel.id,
          channelType: channel.channelType,
          credentialKeys: Object.keys(credentials),
        });
      } else {
        // Credentials might be stored directly (legacy or test data)
        if (channel.credentials && typeof channel.credentials === 'object' && !channel.credentials.encrypted) {
          credentials = channel.credentials;
          logger.warn('Using unencrypted credentials', { channelId: channel.id });
        } else {
          throw new Error('No credentials found');
        }
      }
    } catch (error) {
      logger.error('Failed to decrypt credentials', {
        channelId: channel.id,
        error: error.message,
        credentialsType: typeof channel.credentials,
        hasEncrypted: !!channel.credentials?.encrypted,
      });
      throw AppError.badRequest('Failed to decrypt channel credentials. Please re-save channel configuration.');
    }

    // Send email via SMTP
    if (channel.channelType === 'EMAIL_SMTP') {
      if (!contact.email) throw AppError.badRequest('Contact has no email address');

      try {
        const transporter = nodemailer.createTransport({
          host: credentials.host,
          port: parseInt(credentials.port) || 587,
          secure: credentials.secure === true || credentials.secure === 'true',
          auth: {
            user: credentials.user,
            pass: credentials.pass,
          },
        });

        const fromAddress = credentials.fromEmail
          ? `${credentials.fromName || 'SalesBook'} <${credentials.fromEmail}>`
          : credentials.user;

        const result = await transporter.sendMail({
          from: fromAddress,
          to: contact.email,
          subject: subject,
          html: messageBody,
        });

        await prisma.contactAttempt.create({
          data: {
            tenantId,
            leadId,
            contactId,
            channelConfigId: channel.id,
            channelType: channel.channelType,
            direction: 'OUTBOUND',
            status: 'SENT',
            subject,
            content: messageBody,
            sentAt: new Date(),
          },
        });

        logger.info('Email sent to contact', { channelId: channel.id, contactId, leadId, messageId: result.messageId });

        return success(res, {
          success: true,
          message: 'Email sent successfully',
          messageId: result.messageId,
          recipient: contact.email,
        });
      } catch (error) {
        await prisma.contactAttempt.create({
          data: {
            tenantId,
            leadId,
            contactId,
            channelConfigId: channel.id,
            channelType: channel.channelType,
            direction: 'OUTBOUND',
            status: 'FAILED',
            subject,
            content: messageBody,
            metadata: { error: error.message },
          },
        });

        logger.error('Failed to send email', { channelId: channel.id, contactId, error: error.message });
        throw AppError.badRequest(`Failed to send email: ${error.message}`);
      }
    }

    // Send WhatsApp via Business API
    if (channel.channelType === 'WHATSAPP_BUSINESS') {
      if (!contact.phone) throw AppError.badRequest('Contact has no phone number');

      // Format phone number (remove spaces, dashes, and ensure no + prefix for API)
      const phoneNumber = contact.phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');

      try {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${credentials.phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${credentials.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: phoneNumber,
              type: 'text',
              text: { body: messageBody },
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error?.message || 'WhatsApp API error');
        }

        await prisma.contactAttempt.create({
          data: {
            tenantId,
            leadId,
            contactId,
            channelConfigId: channel.id,
            channelType: channel.channelType,
            direction: 'OUTBOUND',
            status: 'SENT',
            content: messageBody,
            sentAt: new Date(),
          },
        });

        logger.info('WhatsApp message sent', { channelId: channel.id, contactId, leadId, messageId: result.messages?.[0]?.id });

        return success(res, {
          success: true,
          message: 'WhatsApp message sent successfully',
          messageId: result.messages?.[0]?.id,
          recipient: phoneNumber,
        });
      } catch (error) {
        await prisma.contactAttempt.create({
          data: {
            tenantId,
            leadId,
            contactId,
            channelConfigId: channel.id,
            channelType: channel.channelType,
            direction: 'OUTBOUND',
            status: 'FAILED',
            content: messageBody,
            metadata: { error: error.message },
          },
        });

        logger.error('Failed to send WhatsApp message', { channelId: channel.id, contactId, error: error.message });
        throw AppError.badRequest(`Failed to send WhatsApp message: ${error.message}`);
      }
    }

    // Make voice call via Twilio
    if (channel.channelType === 'VOICE') {
      if (!contact.phone) throw AppError.badRequest('Contact has no phone number');

      // Format phone number
      let phoneNumber = contact.phone.replace(/[\s\-\(\)]/g, '');
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = '+' + phoneNumber;
      }

      // Validate Twilio credentials
      if (!credentials.accountSid || !credentials.authToken || !credentials.fromNumber) {
        logger.error('Missing Twilio credentials', {
          hasAccountSid: !!credentials.accountSid,
          hasAuthToken: !!credentials.authToken,
          hasFromNumber: !!credentials.fromNumber,
          credentialKeys: Object.keys(credentials),
        });
        throw AppError.badRequest('Missing Twilio credentials. Please update channel configuration.');
      }

      // Validate Account SID format (should start with "AC")
      if (!credentials.accountSid.startsWith('AC')) {
        logger.error('Invalid Twilio Account SID format', {
          sidPrefix: credentials.accountSid.substring(0, 5),
        });
        throw AppError.badRequest('Invalid Twilio Account SID. Should start with "AC".');
      }

      try {
        const authString = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64');

        // Create TwiML - if message provided, speak it; otherwise just ring
        const twiml = messageBody && messageBody.trim()
          ? `<Response><Say voice="alice">${messageBody.replace(/[<>&'"]/g, '')}</Say></Response>`
          : `<Response><Pause length="30"/></Response>`;

        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Calls.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${authString}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: phoneNumber,
              From: credentials.fromNumber,
              Twiml: twiml,
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Twilio API error');
        }

        await prisma.contactAttempt.create({
          data: {
            tenantId,
            leadId,
            contactId,
            channelConfigId: channel.id,
            channelType: channel.channelType,
            direction: 'OUTBOUND',
            status: 'SENT',
            content: messageBody,
            externalId: result.sid,
            sentAt: new Date(),
          },
        });

        logger.info('Voice call initiated', { channelId: channel.id, contactId, leadId, callSid: result.sid });

        return success(res, {
          success: true,
          message: 'Voice call initiated successfully',
          callSid: result.sid,
          recipient: phoneNumber,
        });
      } catch (error) {
        await prisma.contactAttempt.create({
          data: {
            tenantId,
            leadId,
            contactId,
            channelConfigId: channel.id,
            channelType: channel.channelType,
            direction: 'OUTBOUND',
            status: 'FAILED',
            content: messageBody,
            metadata: { error: error.message },
          },
        });

        logger.error('Failed to initiate voice call', { channelId: channel.id, contactId, error: error.message });
        throw AppError.badRequest(`Failed to initiate call: ${error.message}`);
      }
    }

    throw AppError.badRequest(`Sending not implemented for: ${channel.channelType}`);
  })
);

module.exports = router;
