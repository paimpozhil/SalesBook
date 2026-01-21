const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const logger = require('../utils/logger');
const { success } = require('../utils/response');

const router = express.Router();

// Webhooks are public endpoints - no auth required
// They should verify signatures from the providers

/**
 * @route   POST /api/v1/webhooks/email/:provider
 * @desc    Email provider webhooks (delivery status, bounces, etc.)
 * @access  Public (verified by provider signature)
 */
router.post(
  '/email/:provider',
  asyncHandler(async (req, res) => {
    const { provider } = req.params;
    const payload = req.body;

    logger.info('Email webhook received', { provider, payload });

    // TODO: Verify webhook signature based on provider
    // TODO: Process events and update contact_attempts

    switch (provider) {
      case 'sendgrid':
        // Handle SendGrid events
        break;
      case 'mailchimp':
      case 'mandrill':
        // Handle Mandrill events
        break;
      case 'ses':
        // Handle AWS SES events
        break;
      default:
        logger.warn('Unknown email provider webhook', { provider });
    }

    return success(res, { received: true });
  })
);

/**
 * @route   POST /api/v1/webhooks/twilio
 * @desc    Twilio webhooks (SMS delivery, incoming messages)
 * @access  Public (verified by Twilio signature)
 */
router.post(
  '/twilio',
  asyncHandler(async (req, res) => {
    const payload = req.body;

    logger.info('Twilio webhook received', { payload });

    // TODO: Verify Twilio signature
    // TODO: Handle different event types

    const { MessageSid, MessageStatus, From, To, Body } = payload;

    if (MessageStatus) {
      // Delivery status update
      logger.info('SMS delivery status', { MessageSid, MessageStatus });

      // Update contact attempt
      if (MessageSid) {
        await prisma.contactAttempt.updateMany({
          where: { externalId: MessageSid },
          data: {
            status: MessageStatus === 'delivered' ? 'DELIVERED' :
                   MessageStatus === 'failed' ? 'FAILED' : 'SENT',
            deliveredAt: MessageStatus === 'delivered' ? new Date() : undefined,
          },
        });
      }
    }

    if (Body && From) {
      // Incoming SMS
      logger.info('Incoming SMS', { From, Body });
      // TODO: Create inbound message, link to conversation
    }

    // Twilio expects TwiML response or empty 200
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  })
);

/**
 * @route   GET /api/v1/webhooks/whatsapp
 * @desc    WhatsApp webhook verification
 * @access  Public
 */
router.get(
  '/whatsapp',
  (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      logger.info('WhatsApp webhook verified');
      return res.status(200).send(challenge);
    }

    return res.status(403).send('Forbidden');
  }
);

/**
 * @route   POST /api/v1/webhooks/whatsapp
 * @desc    WhatsApp Business API webhooks
 * @access  Public (verified by signature)
 */
router.post(
  '/whatsapp',
  asyncHandler(async (req, res) => {
    const payload = req.body;

    logger.info('WhatsApp webhook received', { payload: JSON.stringify(payload) });

    // TODO: Verify webhook signature
    // TODO: Process message status updates and incoming messages

    // Process entries
    if (payload.entry) {
      for (const entry of payload.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.value.statuses) {
              // Message status update
              for (const status of change.value.statuses) {
                logger.info('WhatsApp message status', status);
                // TODO: Update contact attempt
              }
            }
            if (change.value.messages) {
              // Incoming message
              for (const message of change.value.messages) {
                logger.info('Incoming WhatsApp message', message);
                // TODO: Create inbound message
              }
            }
          }
        }
      }
    }

    return success(res, { received: true });
  })
);

/**
 * @route   POST /api/v1/webhooks/telegram
 * @desc    Telegram bot webhooks
 * @access  Public
 */
router.post(
  '/telegram',
  asyncHandler(async (req, res) => {
    const payload = req.body;

    logger.info('Telegram webhook received', { payload });

    // TODO: Process Telegram updates
    // - message: incoming message
    // - callback_query: button clicks
    // - etc.

    if (payload.message) {
      const { chat, text, from } = payload.message;
      logger.info('Incoming Telegram message', { chatId: chat.id, from, text });
      // TODO: Link to contact, create conversation message
    }

    return success(res, { received: true });
  })
);

module.exports = router;
