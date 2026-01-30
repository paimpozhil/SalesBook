const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const leadRoutes = require('./routes/leads');
const contactRoutes = require('./routes/contacts');
const dataSourceRoutes = require('./routes/dataSources');
const channelRoutes = require('./routes/channels');
const templateRoutes = require('./routes/templates');
const campaignRoutes = require('./routes/campaigns');
const conversationRoutes = require('./routes/conversations');
const analyticsRoutes = require('./routes/analytics');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhooks');
const industryRoutes = require('./routes/industries');
const positionRoutes = require('./routes/positions');
const noteRoutes = require('./routes/notes');
const activityRoutes = require('./routes/activity');
const tenantRoutes = require('./routes/tenants');
const telegramRoutes = require('./routes/telegram');
const telegramProspectsRoutes = require('./routes/telegramProspects');
const whatsappProspectsRoutes = require('./routes/whatsappProspects');

// Initialize express app
const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Disable for development
}));

// CORS configuration
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
if (config.env !== 'test') {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }));
}

// Rate limiting (skip in development)
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  skip: () => config.env === 'development', // Skip rate limiting in development
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 attempts per minute (increased for development)
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts, please try again later',
    },
  },
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.env,
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/leads', leadRoutes);
app.use('/api/v1/contacts', contactRoutes);
app.use('/api/v1/data-sources', dataSourceRoutes);
app.use('/api/v1/channels', channelRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/campaigns', campaignRoutes);
app.use('/api/v1/conversations', conversationRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/industries', industryRoutes);
app.use('/api/v1/positions', positionRoutes);
app.use('/api/v1/notes', noteRoutes);
app.use('/api/v1/activity', activityRoutes);
app.use('/api/v1/tenants', tenantRoutes);
app.use('/api/v1/telegram', telegramRoutes);
app.use('/api/v1/telegram-prospects', telegramProspectsRoutes);
app.use('/api/v1/whatsapp-prospects', whatsappProspectsRoutes);

// Serve static files in production
if (config.env === 'production') {
  const clientPath = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientPath));

  // Handle client-side routing
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// 404 handler for API routes
app.use('/api', notFoundHandler);

// Global error handler
app.use(errorHandler);

// Start server
const PORT = config.port;

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${config.env} mode`);
    logger.info(`API available at http://localhost:${PORT}/api/v1`);
  });
}

// Export for testing
module.exports = app;
