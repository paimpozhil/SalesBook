require('dotenv').config();

module.exports = {
  // Application
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Database
  databaseUrl: process.env.DATABASE_URL,

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Encryption
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef',

  // File Storage
  storagePath: process.env.STORAGE_PATH || './storage',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 52428800, // 50MB

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) * 60 * 1000 || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 5000, // Increased for development
  },

  // Email - SMTP
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromName: process.env.SMTP_FROM_NAME || 'SalesBook',
    fromEmail: process.env.SMTP_FROM_EMAIL,
  },

  // Email - API Providers
  mandrill: {
    apiKey: process.env.MANDRILL_API_KEY,
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
  },

  // Twilio
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  // WhatsApp Business API
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v17.0',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  },

  // Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  logToFile: process.env.LOG_TO_FILE === 'true',

  // Background Jobs
  jobs: {
    pollInterval: parseInt(process.env.JOB_POLL_INTERVAL, 10) || 30000, // 30 seconds (was 5s)
    concurrency: parseInt(process.env.JOB_CONCURRENCY, 10) || 5,
    timeout: parseInt(process.env.JOB_TIMEOUT, 10) || 300000, // 5 minutes
  },

  // Scraping
  scraper: {
    browser: process.env.SCRAPER_BROWSER || 'chromium',
    headless: process.env.SCRAPER_HEADLESS !== 'false',
    timeout: parseInt(process.env.SCRAPER_TIMEOUT, 10) || 30000,
    concurrency: parseInt(process.env.SCRAPER_CONCURRENCY, 10) || 2,
  },
};
