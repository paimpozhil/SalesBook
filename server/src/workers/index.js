const cron = require('node-cron');
const prisma = require('../config/database');
const queueService = require('../services/queue.service');
const scraperService = require('../services/scraper.service');
const emailService = require('../services/email.service');
const logger = require('../utils/logger');

/**
 * Initialize and register all job handlers
 */
function initializeWorkers() {
  // Register job handlers
  queueService.registerHandler('SCRAPER_RUN', handleScraperJob);
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
  // Check for due data source scrapes every minute
  cron.schedule('* * * * *', async () => {
    await scheduleDueScraperJobs();
  });

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
}

/**
 * Schedule scraper jobs for due data sources
 */
async function scheduleDueScraperJobs() {
  try {
    const dueSources = await prisma.dataSource.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: new Date() },
      },
    });

    for (const source of dueSources) {
      // Add job to queue
      await queueService.addJob('SCRAPER_RUN', { dataSourceId: source.id }, {
        tenantId: source.tenantId,
        priority: 1,
      });

      // Calculate next run time based on frequency
      const nextRunAt = calculateNextRun(source.frequency);
      await prisma.dataSource.update({
        where: { id: source.id },
        data: { nextRunAt },
      });

      logger.debug(`Scheduled scraper job for: ${source.name}`);
    }
  } catch (error) {
    logger.error('Failed to schedule scraper jobs', { error: error.message });
  }
}

/**
 * Calculate next run time based on frequency
 */
function calculateNextRun(frequency) {
  const now = new Date();
  const hours = frequency || 24; // Default to daily
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
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
        nextStepAt: { lte: new Date() },
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

    for (const recipient of pendingRecipients) {
      await queueService.addJob('CAMPAIGN_STEP', {
        recipientId: recipient.id,
        campaignId: recipient.campaignId,
      }, {
        tenantId: recipient.campaign.tenantId,
        priority: 2,
      });
    }

    if (pendingRecipients.length > 0) {
      logger.debug(`Scheduled ${pendingRecipients.length} campaign step jobs`);
    }
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
 * Handle campaign step execution
 */
async function handleCampaignStepJob(payload) {
  const { recipientId, campaignId } = payload;

  const recipient = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    include: {
      campaign: {
        include: {
          steps: {
            orderBy: { order: 'asc' },
          },
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
    s => s.order === recipient.currentStep
  );

  if (!currentStep) {
    // Campaign completed for this recipient
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'COMPLETED' },
    });
    return { completed: true };
  }

  // Execute the step (send message)
  // This would integrate with the appropriate channel service
  logger.info(`Executing campaign step ${currentStep.order} for recipient ${recipientId}`);

  // Record the contact attempt
  await prisma.contactAttempt.create({
    data: {
      tenantId: recipient.campaign.tenantId,
      leadId: recipient.leadId,
      contactId: recipient.contactId,
      campaignId,
      channelType: currentStep.channelType,
      status: 'SENT',
      metadata: {
        stepId: currentStep.id,
        stepOrder: currentStep.order,
      },
    },
  });

  // Update recipient to next step
  const nextStep = recipient.campaign.steps.find(
    s => s.order === recipient.currentStep + 1
  );

  if (nextStep) {
    const nextStepAt = new Date();
    nextStepAt.setHours(nextStepAt.getHours() + (nextStep.delayHours || 24));

    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: {
        currentStep: nextStep.order,
        nextStepAt,
        status: 'IN_PROGRESS',
      },
    });
  } else {
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: { status: 'COMPLETED' },
    });
  }

  return { success: true, stepExecuted: currentStep.order };
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
