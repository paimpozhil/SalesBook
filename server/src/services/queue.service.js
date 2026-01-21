const prisma = require('../config/database');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Database-backed job queue service
 * Uses MySQL/PostgreSQL for job storage instead of Redis
 */
class QueueService {
  constructor() {
    this.isProcessing = false;
    this.handlers = {};
    this.pollInterval = null;
  }

  /**
   * Register a job handler
   * @param {string} jobType - Type of job to handle
   * @param {Function} handler - Handler function (receives job data, returns result)
   */
  registerHandler(jobType, handler) {
    this.handlers[jobType] = handler;
    logger.info(`Registered job handler for: ${jobType}`);
  }

  /**
   * Add a job to the queue
   * @param {string} type - Job type
   * @param {Object} payload - Job data
   * @param {Object} options - Job options
   * @param {string} options.tenantId - Tenant ID
   * @param {number} options.priority - Priority (higher = processed first)
   * @param {Date} options.scheduledAt - When to run (null = immediately)
   * @returns {Promise<Object>} - Created job
   */
  async addJob(type, payload, options = {}) {
    const { tenantId, priority = 0, scheduledAt = null } = options;

    const job = await prisma.jobQueue.create({
      data: {
        tenantId,
        type,
        payload,
        status: 'PENDING',
        priority,
        scheduledAt: scheduledAt || new Date(),
        attempts: 0,
        maxAttempts: 3,
      },
    });

    logger.debug('Job added to queue', { jobId: job.id, type });
    return job;
  }

  /**
   * Add multiple jobs to the queue
   * @param {Array} jobs - Array of { type, payload, options }
   */
  async addJobs(jobs) {
    const data = jobs.map((job) => ({
      tenantId: job.options?.tenantId,
      type: job.type,
      payload: job.payload,
      status: 'PENDING',
      priority: job.options?.priority || 0,
      scheduledAt: job.options?.scheduledAt || new Date(),
      attempts: 0,
      maxAttempts: 3,
    }));

    const result = await prisma.jobQueue.createMany({ data });
    logger.info(`Added ${result.count} jobs to queue`);
    return result;
  }

  /**
   * Start processing jobs
   */
  start() {
    if (this.pollInterval) {
      logger.warn('Queue processor already running');
      return;
    }

    logger.info('Starting job queue processor', {
      interval: config.jobs.pollInterval,
      concurrency: config.jobs.concurrency,
    });

    this.pollInterval = setInterval(
      () => this.processJobs(),
      config.jobs.pollInterval
    );

    // Process immediately on start
    this.processJobs();
  }

  /**
   * Stop processing jobs
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      logger.info('Job queue processor stopped');
    }
  }

  /**
   * Process pending jobs
   */
  async processJobs() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Fetch pending jobs that are due
      const jobs = await prisma.jobQueue.findMany({
        where: {
          status: 'PENDING',
          scheduledAt: { lte: new Date() },
          attempts: { lt: 3 }, // prisma doesn't support self-reference, use maxAttempts default
        },
        orderBy: [
          { priority: 'desc' },
          { scheduledAt: 'asc' },
        ],
        take: config.jobs.concurrency,
      });

      if (jobs.length === 0) {
        this.isProcessing = false;
        return;
      }

      logger.debug(`Processing ${jobs.length} jobs`);

      // Process jobs concurrently
      await Promise.all(jobs.map((job) => this.processJob(job)));
    } catch (error) {
      logger.error('Error in job processor', { error: error.message });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single job
   */
  async processJob(job) {
    const handler = this.handlers[job.type];

    if (!handler) {
      logger.warn(`No handler registered for job type: ${job.type}`);
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorMessage: `No handler for job type: ${job.type}`,
          completedAt: new Date(),
        },
      });
      return;
    }

    // Mark as processing
    await prisma.jobQueue.update({
      where: { id: job.id },
      data: {
        status: 'PROCESSING',
        startedAt: new Date(),
        attempts: job.attempts + 1,
      },
    });

    try {
      // Execute handler with timeout
      const result = await Promise.race([
        handler(job.payload, job),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Job timeout')), config.jobs.timeout)
        ),
      ]);

      // Mark as completed
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      logger.debug('Job completed', { jobId: job.id, type: job.type });
    } catch (error) {
      const attempts = job.attempts + 1;
      const maxAttempts = job.maxAttempts || 3;

      // Mark as failed or pending retry
      await prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: attempts >= maxAttempts ? 'FAILED' : 'PENDING',
          errorMessage: error.message,
          completedAt: attempts >= maxAttempts ? new Date() : null,
          // Exponential backoff for retry
          scheduledAt: attempts < maxAttempts
            ? new Date(Date.now() + Math.pow(2, attempts) * 60000)
            : undefined,
        },
      });

      logger.error('Job failed', {
        jobId: job.id,
        type: job.type,
        error: error.message,
        attempts,
        willRetry: attempts < maxAttempts,
      });
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    return prisma.jobQueue.findUnique({
      where: { id: jobId },
    });
  }

  /**
   * Get queue statistics
   */
  async getStats(tenantId = null) {
    const where = tenantId ? { tenantId } : {};

    const [pending, processing, completed, failed] = await Promise.all([
      prisma.jobQueue.count({ where: { ...where, status: 'PENDING' } }),
      prisma.jobQueue.count({ where: { ...where, status: 'PROCESSING' } }),
      prisma.jobQueue.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.jobQueue.count({ where: { ...where, status: 'FAILED' } }),
    ]);

    return { pending, processing, completed, failed, total: pending + processing + completed + failed };
  }

  /**
   * Cleanup old completed/failed jobs
   * @param {number} days - Delete jobs older than this many days
   */
  async cleanup(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await prisma.jobQueue.deleteMany({
      where: {
        status: { in: ['COMPLETED', 'FAILED'] },
        completedAt: { lt: cutoffDate },
      },
    });

    logger.info(`Cleaned up ${result.count} old jobs`);
    return result.count;
  }
}

module.exports = new QueueService();
