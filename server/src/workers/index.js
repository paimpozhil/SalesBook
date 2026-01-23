const cron = require('node-cron');
const nodemailer = require('nodemailer');
const prisma = require('../config/database');
const queueService = require('../services/queue.service');
const scraperService = require('../services/scraper.service');
const emailService = require('../services/email.service');
const templateService = require('../services/template.service');
const { decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

/**
 * Initialize and register all job handlers
 */
function initializeWorkers() {
  // Register job handlers (job types must match JobType enum in schema)
  // SCRAPE handler disabled - using file upload instead
  // queueService.registerHandler('SCRAPE', handleScraperJob);
  queueService.registerHandler('EMAIL_SEND', handleEmailJob);
  queueService.registerHandler('CAMPAIGN_STEP', handleCampaignStepJob);
  queueService.registerHandler('CLEANUP', handleCleanupJob);

  // Start the queue processor
  queueService.start();

  logger.info('Job workers initialized');
}

/**
 * Initialize cron jobs for scheduled tasks
 */
function initializeCronJobs() {
  // Scraper cron disabled - using file upload instead
  // cron.schedule('* * * * *', async () => {
  //   await scheduleDueScraperJobs();
  // });

  // Process campaign steps every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await scheduleCampaignSteps();
  });

  // Daily cleanup at 3 AM
  cron.schedule('0 3 * * *', async () => {
    await queueService.addJob('CLEANUP', { days: 30 });
  });

  // Daily analytics aggregation at 1 AM
  cron.schedule('0 1 * * *', async () => {
    await aggregateDailyAnalytics();
  });

  logger.info('Cron jobs initialized');

  // Run campaign scheduler immediately on startup (after 5 second delay)
  setTimeout(async () => {
    logger.info('Running initial campaign step check...');
    await scheduleCampaignSteps();
  }, 5000);
}

/**
 * Schedule scraper jobs for due data sources
 * Based on pollingFrequency and lastRunAt
 */
async function scheduleDueScraperJobs() {
  try {
    const activeSources = await prisma.dataSource.findMany({
      where: {
        isActive: true,
        pollingFrequency: { not: null },
      },
    });

    const now = new Date();

    for (const source of activeSources) {
      // Parse polling frequency (e.g., "1h", "24h", "7d")
      const frequencyHours = parseFrequency(source.pollingFrequency);
      if (!frequencyHours) continue;

      // Check if due for run
      const lastRun = source.lastRunAt ? new Date(source.lastRunAt) : null;
      const nextRunTime = lastRun
        ? new Date(lastRun.getTime() + frequencyHours * 60 * 60 * 1000)
        : now;

      if (nextRunTime <= now) {
        // Add job to queue
        await queueService.addJob('SCRAPE', { dataSourceId: source.id }, {
          tenantId: source.tenantId,
          priority: 1,
        });

        logger.debug(`Scheduled scraper job for: ${source.name}`);
      }
    }
  } catch (error) {
    logger.error('Failed to schedule scraper jobs', { error: error.message });
  }
}

/**
 * Parse frequency string to hours
 * @param {string} freq - e.g., "1h", "24h", "7d"
 * @returns {number|null} - hours
 */
function parseFrequency(freq) {
  if (!freq) return null;
  const match = freq.match(/^(\d+)([hdwm])$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'h': return value;
    case 'd': return value * 24;
    case 'w': return value * 24 * 7;
    case 'm': return value * 24 * 30;
    default: return null;
  }
}

/**
 * Schedule campaign step executions
 */
async function scheduleCampaignSteps() {
  try {
    // Find active campaigns with pending steps
    const pendingRecipients = await prisma.campaignRecipient.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        nextActionAt: { lte: new Date() },
        campaign: {
          status: 'ACTIVE',
        },
      },
      include: {
        campaign: {
          include: {
            steps: true,
          },
        },
        lead: true,
        contact: true,
      },
      take: 100, // Process in batches
    });

    if (pendingRecipients.length === 0) {
      logger.info('Campaign scheduler: No pending recipients found');
      return;
    }

    logger.info(`Campaign scheduler: Found ${pendingRecipients.length} recipients to process`);

    for (const recipient of pendingRecipients) {
      await queueService.addJob('CAMPAIGN_STEP', {
        recipientId: recipient.id,
        campaignId: recipient.campaignId,
      }, {
        tenantId: recipient.campaign.tenantId,
        priority: 2,
      });
      logger.info(`Queued campaign step for recipient ${recipient.id} (${recipient.contact?.email || 'no email'})`);
    }

    logger.info(`Scheduled ${pendingRecipients.length} campaign step jobs`);
  } catch (error) {
    logger.error('Failed to schedule campaign steps', { error: error.message });
  }
}

/**
 * Aggregate daily analytics
 */
async function aggregateDailyAnalytics() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    // Get all tenants
    const tenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
    });

    for (const tenant of tenants) {
      // Aggregate contact attempts by channel
      const attempts = await prisma.contactAttempt.groupBy({
        by: ['channelType', 'status'],
        where: {
          tenantId: tenant.id,
          createdAt: {
            gte: yesterday,
            lte: endOfYesterday,
          },
        },
        _count: true,
      });

      // Create daily analytics records
      const channelStats = {};
      for (const attempt of attempts) {
        if (!channelStats[attempt.channelType]) {
          channelStats[attempt.channelType] = {
            sent: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
            replied: 0,
            failed: 0,
          };
        }

        switch (attempt.status) {
          case 'SENT':
          case 'DELIVERED':
            channelStats[attempt.channelType].sent += attempt._count;
            channelStats[attempt.channelType].delivered += attempt._count;
            break;
          case 'OPENED':
            channelStats[attempt.channelType].opened += attempt._count;
            break;
          case 'CLICKED':
            channelStats[attempt.channelType].clicked += attempt._count;
            break;
          case 'REPLIED':
            channelStats[attempt.channelType].replied += attempt._count;
            break;
          case 'FAILED':
          case 'BOUNCED':
            channelStats[attempt.channelType].failed += attempt._count;
            break;
        }
      }

      // Upsert analytics records
      for (const [channel, stats] of Object.entries(channelStats)) {
        await prisma.analyticsDaily.upsert({
          where: {
            tenantId_date_channelType: {
              tenantId: tenant.id,
              date: yesterday,
              channelType: channel,
            },
          },
          update: stats,
          create: {
            tenantId: tenant.id,
            date: yesterday,
            channelType: channel,
            ...stats,
          },
        });
      }
    }

    logger.info('Daily analytics aggregation completed');
  } catch (error) {
    logger.error('Failed to aggregate daily analytics', { error: error.message });
  }
}

// Job Handlers

/**
 * Handle scraper job
 */
async function handleScraperJob(payload) {
  const dataSource = await prisma.dataSource.findUnique({
    where: { id: payload.dataSourceId },
  });

  if (!dataSource) {
    throw new Error(`Data source not found: ${payload.dataSourceId}`);
  }

  return await scraperService.run(dataSource);
}

/**
 * Handle email send job
 */
async function handleEmailJob(payload) {
  const { to, subject, html, channelConfigId } = payload;

  if (channelConfigId) {
    const channelConfig = await prisma.channelConfig.findUnique({
      where: { id: channelConfigId },
    });

    if (channelConfig) {
      return await emailService.sendWithConfig(channelConfig, { to, subject, html });
    }
  }

  return await emailService.send({ to, subject, html });
}

/**
 * Handle campaign step execution - sends actual messages via channels
 */
async function handleCampaignStepJob(payload) {
  const { recipientId, campaignId } = payload;

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    include: {
      campaign: {
        include: {
          steps: {
            include: {
              template: true,
              channelConfig: true,
            },
            orderBy: { stepOrder: 'asc' },
          },
          createdBy: { select: { id: true, name: true, email: true } },
          tenant: { select: { id: true, name: true } },
        },
      },
      lead: true,
      contact: true,
    },
  });

  if (!recipient || recipient.campaign.status !== 'ACTIVE') {
    return { skipped: true, reason: 'Campaign not active or recipient not found' };
  }

  const currentStep = recipient.campaign.steps.find(
    s => s.stepOrder === recipient.currentStep
  );

  if (!currentStep) {
    // Campaign completed for this recipient
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'COMPLETED' },
    });
    return { completed: true };
  }

  logger.info(`Executing campaign step ${currentStep.stepOrder} for recipient ${recipientId}`, {
    channelType: currentStep.channelType,
    templateId: currentStep.templateId,
    contactEmail: recipient.contact?.email,
    contactPhone: recipient.contact?.phone,
  });

  // Build template context
  const context = templateService.buildContext({
    lead: recipient.lead,
    contact: recipient.contact,
    sender: recipient.campaign.createdBy,
    tenant: recipient.campaign.tenant,
  });

  // Render template
  const renderedSubject = templateService.render(currentStep.template?.subject || '', context);
  const renderedBody = templateService.render(currentStep.template?.body || '', context);

  // Decrypt channel credentials
  let credentials;
  try {
    const encryptedData = currentStep.channelConfig?.credentials?.encrypted;
    if (encryptedData) {
      credentials = JSON.parse(decrypt(encryptedData));
    } else if (currentStep.channelConfig?.credentials) {
      credentials = currentStep.channelConfig.credentials;
    }
  } catch (error) {
    logger.error('Failed to decrypt channel credentials', { error: error.message });
    await recordAttempt(recipient, currentStep, campaignId, 'FAILED', { error: 'Credential decryption failed' }, '', null);
    throw error;
  }

  let sendResult = { success: false };

  try {
    // Send via appropriate channel
    switch (currentStep.channelType) {
      case 'EMAIL_SMTP':
        sendResult = await sendEmailSmtp(credentials, recipient.contact, renderedSubject, renderedBody);
        break;
      case 'WHATSAPP_BUSINESS':
        sendResult = await sendWhatsApp(credentials, recipient.contact, renderedBody);
        break;
      case 'VOICE':
        sendResult = await sendVoiceCall(credentials, recipient.contact, renderedBody);
        break;
      default:
        logger.warn(`Channel type ${currentStep.channelType} not implemented for campaigns`);
        sendResult = { success: false, error: `Channel type ${currentStep.channelType} not supported` };
    }
  } catch (error) {
    logger.error('Failed to send campaign message', { error: error.message, recipientId });
    sendResult = { success: false, error: error.message };
  }

  // Record the contact attempt
  await recordAttempt(
    recipient,
    currentStep,
    campaignId,
    sendResult.success ? 'SENT' : 'FAILED',
    {
      stepId: currentStep.id,
      stepOrder: currentStep.stepOrder,
      messageId: sendResult.messageId,
      error: sendResult.error,
    },
    renderedBody,
    renderedSubject
  );

  // Update recipient to next step (even if this step failed, move forward)
  const nextStep = recipient.campaign.steps.find(
    s => s.stepOrder === recipient.currentStep + 1
  );

  if (nextStep) {
    const nextActionAt = new Date();
    // Calculate total delay in minutes: days * 24 * 60 + hours * 60 + minutes
    const delayMinutes =
      (nextStep.delayDays || 0) * 24 * 60 +
      (nextStep.delayHours || 0) * 60 +
      (nextStep.delayMinutes || 0);
    // If no delay specified, default to 24 hours
    nextActionAt.setMinutes(nextActionAt.getMinutes() + (delayMinutes || 24 * 60));

    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: {
        currentStep: nextStep.stepOrder,
        nextActionAt,
        status: 'IN_PROGRESS',
      },
    });
  } else {
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'COMPLETED' },
    });

    // Check if all recipients are now completed - if so, mark campaign as completed
    const pendingCount = await prisma.campaignRecipient.count({
      where: {
        campaignId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });

    if (pendingCount === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      logger.info(`Campaign ${campaignId} completed - all recipients processed`);
    }
  }

  return { success: sendResult.success, stepExecuted: currentStep.stepOrder };
}

/**
 * Record contact attempt for campaign step
 */
async function recordAttempt(recipient, step, campaignId, status, metadata, content = '', subject = null) {
  await prisma.contactAttempt.create({
    data: {
      tenantId: recipient.campaign.tenantId,
      leadId: recipient.leadId,
      contactId: recipient.contactId,
      campaignId,
      campaignStepId: step.id,
      channelType: step.channelType,
      channelConfigId: step.channelConfigId,
      status,
      subject,
      content,
      metadata,
      sentAt: status === 'SENT' ? new Date() : null,
    },
  });
}

/**
 * Send email via SMTP
 */
async function sendEmailSmtp(credentials, contact, subject, body) {
  if (!contact.email) {
    return { success: false, error: 'Contact has no email' };
  }

  const transporter = nodemailer.createTransport({
    host: credentials.host,
    port: credentials.port || 587,
    secure: credentials.secure || false,
    auth: {
      user: credentials.user,
      pass: credentials.pass,
    },
  });

  const result = await transporter.sendMail({
    from: credentials.from || credentials.user,
    to: contact.email,
    subject,
    html: body,
  });

  logger.info('Campaign email sent', { to: contact.email, messageId: result.messageId });
  return { success: true, messageId: result.messageId };
}

/**
 * Send WhatsApp message via Business API
 */
async function sendWhatsApp(credentials, contact, body) {
  if (!contact.phone) {
    return { success: false, error: 'Contact has no phone' };
  }

  const phoneNumber = contact.phone.replace(/[\s\-\(\)]/g, '').replace(/^\+/, '');

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
        text: { body },
      }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    logger.error('WhatsApp API error', { error: result.error });
    return { success: false, error: result.error?.message || 'WhatsApp API error' };
  }

  logger.info('Campaign WhatsApp sent', { to: phoneNumber, messageId: result.messages?.[0]?.id });
  return { success: true, messageId: result.messages?.[0]?.id };
}

/**
 * Send voice call via Twilio
 */
async function sendVoiceCall(credentials, contact, message) {
  if (!contact.phone) {
    return { success: false, error: 'Contact has no phone' };
  }

  let phoneNumber = contact.phone.replace(/[\s\-\(\)]/g, '');
  if (!phoneNumber.startsWith('+')) {
    phoneNumber = '+' + phoneNumber;
  }

  if (!credentials.accountSid?.startsWith('AC')) {
    return { success: false, error: 'Invalid Twilio Account SID' };
  }

  const authString = Buffer.from(`${credentials.accountSid}:${credentials.authToken}`).toString('base64');
  const twiml = message
    ? `<Response><Say voice="alice">${message.replace(/[<>&'"]/g, '')}</Say></Response>`
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
    logger.error('Twilio API error', { error: result.message });
    return { success: false, error: result.message || 'Twilio API error' };
  }

  logger.info('Campaign voice call initiated', { to: phoneNumber, callSid: result.sid });
  return { success: true, messageId: result.sid };
}

/**
 * Handle cleanup job
 */
async function handleCleanupJob(payload) {
  const days = payload.days || 30;

  // Cleanup old jobs
  const jobsDeleted = await queueService.cleanup(days);

  // Cleanup old contact attempts (keep for analytics)
  // Don't delete, just summarize

  return { jobsDeleted };
}

module.exports = {
  initializeWorkers,
  initializeCronJobs,
};
