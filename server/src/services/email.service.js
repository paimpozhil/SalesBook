const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    if (config.smtp.host && config.smtp.user) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
      });

      logger.info('Email transporter initialized with SMTP');
    } else {
      logger.warn('Email not configured. Set SMTP credentials in environment.');
    }
  }

  /**
   * Send an email using SMTP
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML body
   * @param {string} options.text - Plain text body (optional)
   * @param {string} options.from - Sender (optional)
   * @param {Array} options.attachments - Attachments array (optional)
   * @returns {Promise<Object>} - Send result
   */
  async send({ to, subject, html, text, from, attachments = [] }) {
    if (!this.transporter) {
      throw new Error('Email not configured');
    }

    const fromAddress = from || `${config.smtp.fromName} <${config.smtp.fromEmail}>`;

    const mailOptions = {
      from: fromAddress,
      to,
      subject,
      html,
      text: text || this.stripHtml(html),
      attachments,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      logger.info('Email sent', { to, subject, messageId: result.messageId });
      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      logger.error('Failed to send email', { to, subject, error: error.message });
      throw error;
    }
  }

  /**
   * Send using channel config credentials
   * @param {Object} channelConfig - Channel configuration with credentials
   * @param {Object} emailOptions - Email options
   */
  async sendWithConfig(channelConfig, emailOptions) {
    const credentials = channelConfig.credentials;

    const transporter = nodemailer.createTransport({
      host: credentials.host,
      port: credentials.port || 587,
      secure: credentials.secure || false,
      auth: {
        user: credentials.username,
        pass: credentials.password,
      },
    });

    const from = credentials.fromEmail
      ? `${credentials.fromName || 'BlazeHexa Leads'} <${credentials.fromEmail}>`
      : emailOptions.from;

    const mailOptions = {
      from,
      to: emailOptions.to,
      subject: emailOptions.subject,
      html: emailOptions.html,
      text: emailOptions.text || this.stripHtml(emailOptions.html),
      attachments: emailOptions.attachments || [],
    };

    try {
      const result = await transporter.sendMail(mailOptions);
      return {
        success: true,
        messageId: result.messageId,
        provider: 'smtp',
      };
    } catch (error) {
      logger.error('Failed to send email via channel', {
        channelId: channelConfig.id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send via SendGrid API
   * @param {string} apiKey - SendGrid API key
   * @param {Object} emailOptions - Email options
   */
  async sendViaSendGrid(apiKey, emailOptions) {
    // Would implement SendGrid API call here
    // For now, throw not implemented
    throw new Error('SendGrid integration not yet implemented');
  }

  /**
   * Send via Mandrill/Mailchimp API
   * @param {string} apiKey - Mandrill API key
   * @param {Object} emailOptions - Email options
   */
  async sendViaMandrill(apiKey, emailOptions) {
    // Would implement Mandrill API call here
    throw new Error('Mandrill integration not yet implemented');
  }

  /**
   * Verify SMTP connection
   */
  async verify() {
    if (!this.transporter) {
      return { configured: false };
    }

    try {
      await this.transporter.verify();
      return { configured: true, verified: true };
    } catch (error) {
      return { configured: true, verified: false, error: error.message };
    }
  }

  /**
   * Strip HTML tags for plain text version
   */
  stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }
}

module.exports = new EmailService();
