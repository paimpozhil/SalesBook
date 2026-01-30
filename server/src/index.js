const app = require('./app');
const config = require('./config');
const prisma = require('./config/database');
const { initializeWorkers, initializeCronJobs } = require('./workers');
const logger = require('./utils/logger');
const telegramService = require('./services/telegram.service');
const { decrypt } = require('./utils/encryption');

const PORT = config.port || 5000;

/**
 * Auto-reconnect all Telegram channels on server startup
 */
async function autoReconnectTelegramChannels() {
  try {
    // Find all active Telegram channels
    const telegramChannels = await prisma.channelConfig.findMany({
      where: {
        channelType: 'TELEGRAM',
        isActive: true,
      },
    });

    if (telegramChannels.length === 0) {
      logger.info('No Telegram channels to reconnect');
      return;
    }

    logger.info(`Auto-reconnecting ${telegramChannels.length} Telegram channel(s)...`);

    // Prepare channels with decrypted credentials
    const channelsWithCreds = [];
    for (const channel of telegramChannels) {
      try {
        let credentials;
        const encryptedData = channel.credentials?.encrypted;
        if (encryptedData) {
          credentials = JSON.parse(decrypt(encryptedData));
        } else if (channel.credentials && typeof channel.credentials === 'object') {
          credentials = channel.credentials;
        }

        if (credentials?.apiId && credentials?.sessionString) {
          channelsWithCreds.push({
            id: channel.id,
            tenantId: channel.tenantId,
            credentials,
          });
        } else {
          logger.warn(`Telegram channel ${channel.id} missing apiId or sessionString, skipping`);
        }
      } catch (error) {
        logger.error(`Failed to decrypt credentials for channel ${channel.id}: ${error.message}`);
      }
    }

    // Auto-reconnect all channels
    const results = await telegramService.autoReconnectAll(channelsWithCreds);

    const connected = results.filter(r => r.status === 'connected').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    logger.info(`Telegram auto-reconnect complete: ${connected} connected, ${failed} failed, ${skipped} skipped`);
  } catch (error) {
    logger.error(`Error during Telegram auto-reconnect: ${error.message}`);
  }
}

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Initialize background workers and cron jobs
    if (process.env.ENABLE_WORKERS !== 'false') {
      initializeWorkers();
      initializeCronJobs();
    }

    // Auto-reconnect Telegram channels
    await autoReconnectTelegramChannels();

    // Start server
    app.listen(PORT, () => {
      logger.info(`Server running in ${config.env} mode on port ${PORT}`);
      logger.info(`API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
