const express = require('express');
const { param } = require('express-validator');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const { getTenantId } = require('../middleware/tenant');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Get activity timeline for a lead
router.get(
  '/lead/:leadId',
  [param('leadId').isInt().withMessage('Invalid lead ID')],
  validate,
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const leadId = parseInt(req.params.leadId);

    // Verify lead belongs to tenant
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        ...(tenantId && { tenantId }),
        isDeleted: false,
      },
      select: {
        id: true,
        createdAt: true,
        createdBy: {
          select: { id: true, name: true },
        },
        source: {
          select: { id: true, name: true },
        },
      },
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lead not found' },
      });
    }

    // Fetch all activity data in parallel
    const [contactAttempts, conversations, notes, campaignRecipients] = await Promise.all([
      // Contact attempts (emails, messages sent)
      prisma.contactAttempt.findMany({
        where: { leadId },
        select: {
          id: true,
          channelType: true,
          direction: true,
          status: true,
          subject: true,
          sentAt: true,
          deliveredAt: true,
          openedAt: true,
          clickedAt: true,
          repliedAt: true,
          createdAt: true,
          contact: {
            select: { id: true, name: true, email: true },
          },
          campaign: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Conversations
      prisma.conversation.findMany({
        where: { leadId },
        select: {
          id: true,
          channelType: true,
          status: true,
          lastMessageAt: true,
          createdAt: true,
          contact: {
            select: { id: true, name: true, email: true },
          },
          assignedTo: {
            select: { id: true, name: true },
          },
          _count: {
            select: { messages: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Notes
      prisma.note.findMany({
        where: { leadId },
        select: {
          id: true,
          content: true,
          createdAt: true,
          createdBy: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // Campaign enrollments
      prisma.campaignRecipient.findMany({
        where: { leadId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          campaign: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Build unified activity timeline
    const activities = [];

    // Add lead creation event
    activities.push({
      type: 'LEAD_CREATED',
      timestamp: lead.createdAt,
      data: {
        createdBy: lead.createdBy,
        source: lead.source,
      },
    });

    // Add contact attempts
    contactAttempts.forEach((attempt) => {
      activities.push({
        type: 'CONTACT_ATTEMPT',
        timestamp: attempt.createdAt,
        data: {
          id: attempt.id,
          channelType: attempt.channelType,
          direction: attempt.direction,
          status: attempt.status,
          subject: attempt.subject,
          contact: attempt.contact,
          campaign: attempt.campaign,
          sentAt: attempt.sentAt,
          deliveredAt: attempt.deliveredAt,
          openedAt: attempt.openedAt,
          clickedAt: attempt.clickedAt,
          repliedAt: attempt.repliedAt,
        },
      });

      // Add engagement events (opened, clicked, replied)
      if (attempt.openedAt) {
        activities.push({
          type: 'EMAIL_OPENED',
          timestamp: attempt.openedAt,
          data: {
            attemptId: attempt.id,
            contact: attempt.contact,
            subject: attempt.subject,
          },
        });
      }
      if (attempt.clickedAt) {
        activities.push({
          type: 'EMAIL_CLICKED',
          timestamp: attempt.clickedAt,
          data: {
            attemptId: attempt.id,
            contact: attempt.contact,
            subject: attempt.subject,
          },
        });
      }
      if (attempt.repliedAt) {
        activities.push({
          type: 'EMAIL_REPLIED',
          timestamp: attempt.repliedAt,
          data: {
            attemptId: attempt.id,
            contact: attempt.contact,
            subject: attempt.subject,
          },
        });
      }
    });

    // Add conversations
    conversations.forEach((conv) => {
      activities.push({
        type: 'CONVERSATION_STARTED',
        timestamp: conv.createdAt,
        data: {
          id: conv.id,
          channelType: conv.channelType,
          status: conv.status,
          contact: conv.contact,
          assignedTo: conv.assignedTo,
          messageCount: conv._count.messages,
        },
      });
    });

    // Add notes
    notes.forEach((note) => {
      activities.push({
        type: 'NOTE_ADDED',
        timestamp: note.createdAt,
        data: {
          id: note.id,
          content: note.content.length > 100 ? note.content.substring(0, 100) + '...' : note.content,
          createdBy: note.createdBy,
        },
      });
    });

    // Add campaign enrollments
    campaignRecipients.forEach((recipient) => {
      activities.push({
        type: 'CAMPAIGN_ENROLLED',
        timestamp: recipient.createdAt,
        data: {
          id: recipient.id,
          campaign: recipient.campaign,
          status: recipient.status,
        },
      });
    });

    // Sort all activities by timestamp (newest first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      data: {
        activities,
        summary: {
          totalContactAttempts: contactAttempts.length,
          totalConversations: conversations.length,
          totalNotes: notes.length,
          totalCampaigns: campaignRecipients.length,
        },
      },
    });
  })
);

module.exports = router;
