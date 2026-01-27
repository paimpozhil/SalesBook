const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const prisma = require('../config/database');
const logger = require('../utils/logger');
const { decrypt } = require('../utils/encryption');

class ImapPollerService {
  constructor() {
    this.isPolling = false;
    this.processedMessageIds = new Set(); // In-memory cache to avoid reprocessing
  }

  /**
   * Decrypt channel credentials
   */
  decryptCredentials(channel) {
    try {
      const encryptedData = channel.credentials?.encrypted;
      if (encryptedData) {
        return JSON.parse(decrypt(encryptedData));
      }
      // Fallback for unencrypted credentials (legacy)
      return channel.credentials || {};
    } catch (error) {
      logger.error(`Failed to decrypt credentials for channel ${channel.id}:`, error.message);
      return {};
    }
  }

  /**
   * Poll all channels that have IMAP enabled
   */
  async pollAll() {
    if (this.isPolling) {
      logger.warn('IMAP polling already in progress, skipping...');
      return;
    }

    this.isPolling = true;
    logger.info('Starting IMAP poll for all channels...');

    try {
      // Find all EMAIL_SMTP channels with IMAP enabled
      const channels = await prisma.channelConfig.findMany({
        where: {
          channelType: 'EMAIL_SMTP',
          isActive: true,
        },
        include: {
          tenant: true,
        },
      });

      // Filter channels that have IMAP enabled (decrypt credentials first)
      const imapChannels = channels.filter((ch) => {
        const creds = this.decryptCredentials(ch);
        return creds.imapEnabled === true && creds.imapHost;
      });

      logger.info(`Found ${imapChannels.length} channels with IMAP enabled`);

      for (const channel of imapChannels) {
        try {
          await this.pollChannel(channel);
        } catch (error) {
          logger.error(`Failed to poll channel ${channel.id}:`, error.message);
        }
      }
    } catch (error) {
      logger.error('IMAP polling error:', error.message);
    } finally {
      this.isPolling = false;
      logger.info('IMAP poll completed');
    }
  }

  /**
   * Poll a single channel for new emails
   */
  async pollChannel(channel) {
    const credentials = this.decryptCredentials(channel);

    const config = {
      imap: {
        user: credentials.imapUser || credentials.user,
        password: credentials.imapPass || credentials.pass,
        host: credentials.imapHost,
        port: parseInt(credentials.imapPort) || 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000,
      },
    };

    logger.info(`Connecting to IMAP for channel ${channel.id} (${channel.name})...`);

    let connection;
    try {
      connection = await imaps.connect(config);
      await connection.openBox('INBOX');

      // Search for unread messages
      const searchCriteria = ['UNSEEN'];
      const fetchOptions = {
        bodies: ['HEADER', 'TEXT', ''],
        markSeen: false, // Don't mark as seen until we process successfully
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      logger.info(`Found ${messages.length} unread messages in channel ${channel.id}`);

      for (const message of messages) {
        try {
          await this.processMessage(connection, message, channel);
        } catch (error) {
          logger.error(`Failed to process message: ${error.message || error}`);
          logger.error(`Stack: ${error.stack || 'No stack trace'}`);
        }
      }
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (e) {
          // Ignore close errors
        }
      }
    }
  }

  /**
   * Process a single email message
   */
  async processMessage(connection, message, channel) {
    // Get the full message for parsing
    const all = message.parts.find((part) => part.which === '');
    if (!all) return;

    const parsed = await simpleParser(all.body);
    const messageId = parsed.messageId;

    // Skip if already processed (in-memory check)
    if (this.processedMessageIds.has(messageId)) {
      return;
    }

    const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
    const fromName = parsed.from?.value?.[0]?.name || '';
    const subject = parsed.subject || '(No Subject)';
    const textBody = parsed.text || '';
    const htmlBody = parsed.html || '';
    const receivedDate = parsed.date || new Date();

    logger.info(`Processing email from: ${fromEmail}, subject: ${subject}, date: ${receivedDate}`);

    if (!fromEmail) {
      logger.warn('No from email address found, skipping');
      return;
    }

    // Find contact by email in this tenant (case-insensitive search)
    logger.info(`Looking for contact with email: ${fromEmail} in tenant ${channel.tenantId}`);

    // Get all contacts and do case-insensitive match in JS (SQLite doesn't support mode: 'insensitive' well)
    const allContacts = await prisma.contact.findMany({
      where: {
        tenantId: channel.tenantId,
      },
      include: {
        lead: true,
      },
    });

    const contact = allContacts.find(c => c.email && c.email.toLowerCase() === fromEmail.toLowerCase());

    if (!contact) {
      // Log available contacts for debugging (already fetched above)
      const contactEmails = allContacts.map(c => c.email).filter(Boolean);
      logger.info(`No matching contact found for ${fromEmail}. Available contacts (${contactEmails.length}): ${JSON.stringify(contactEmails.slice(0, 10))}`);
      logger.info(`Tip: Make sure the contact's email in the system matches the sender's email exactly`);
      // Optionally: Could create unknown contact or log to a separate table
      // For now, mark as seen and skip
      await this.markAsSeen(connection, message);
      this.processedMessageIds.add(messageId);
      return;
    }

    logger.info(`Found contact: ${contact.id} (${contact.email}) for lead ${contact.leadId}`);

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        tenantId: channel.tenantId,
        leadId: contact.leadId,
        contactId: contact.id,
        channelType: 'EMAIL_SMTP',
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          tenantId: channel.tenantId,
          leadId: contact.leadId,
          contactId: contact.id,
          channelType: 'EMAIL_SMTP',
          status: 'OPEN',
          lastMessageAt: receivedDate,
        },
      });
      logger.info(`Created new conversation ${conversation.id} for contact ${contact.id}`);
    } else {
      logger.info(`Found existing conversation ${conversation.id} for contact ${contact.id}`);
    }

    // Check if this message was already stored (by external ID)
    // Use raw query for MySQL JSON search since Prisma's path queries don't work well with MySQL
    const existingMessages = await prisma.$queryRaw`
      SELECT id FROM messages
      WHERE conversation_id = ${conversation.id}
      AND JSON_EXTRACT(metadata, '$.messageId') = ${messageId}
      LIMIT 1
    `;
    const existingMessage = existingMessages.length > 0 ? existingMessages[0] : null;

    if (existingMessage) {
      logger.info(`Message ${messageId} already exists, skipping`);
      this.processedMessageIds.add(messageId);
      return;
    }

    // Create message record
    const newMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        content: htmlBody || textBody,
        metadata: {
          messageId,
          subject,
          fromName,
          fromEmail,
          receivedAt: receivedDate.toISOString(),
        },
      },
    });

    logger.info(`Created inbound message ${newMessage.id} in conversation ${conversation.id}`);

    // Update conversation lastMessageAt
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: receivedDate,
        status: 'OPEN', // Reopen if it was closed
      },
    });

    // Update lead status if applicable (e.g., mark as CONTACTED if NEW)
    if (contact.lead?.status === 'NEW') {
      await prisma.lead.update({
        where: { id: contact.leadId },
        data: { status: 'CONTACTED' },
      });
    }

    // Check if there's a campaign recipient for this contact and mark as REPLIED
    const campaignRecipient = await prisma.campaignRecipient.findFirst({
      where: {
        contactId: contact.id,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });

    if (campaignRecipient) {
      await prisma.campaignRecipient.update({
        where: { id: campaignRecipient.id },
        data: { status: 'REPLIED' },
      });
      logger.info(`Marked campaign recipient ${campaignRecipient.id} as REPLIED`);
    }

    // Mark email as seen
    await this.markAsSeen(connection, message);
    this.processedMessageIds.add(messageId);

    logger.info(`Successfully processed inbound email from ${fromEmail} -> conversation ${conversation.id}`);
  }

  /**
   * Mark message as seen in IMAP
   */
  async markAsSeen(connection, message) {
    try {
      const uid = message.attributes.uid;
      await connection.addFlags(uid, ['\\Seen']);
    } catch (error) {
      logger.error('Failed to mark message as seen:', error.message);
    }
  }

  /**
   * Poll a specific channel by ID
   */
  async pollChannelById(channelId) {
    const channel = await prisma.channelConfig.findUnique({
      where: { id: channelId },
      include: { tenant: true },
    });

    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.channelType !== 'EMAIL_SMTP') {
      throw new Error('Channel is not EMAIL_SMTP');
    }

    const creds = this.decryptCredentials(channel);
    if (!creds.imapEnabled || !creds.imapHost) {
      throw new Error('IMAP not enabled for this channel');
    }

    await this.pollChannel(channel);
  }

  /**
   * Test IMAP connection for a channel
   */
  async testConnection(credentials) {
    const config = {
      imap: {
        user: credentials.imapUser || credentials.user,
        password: credentials.imapPass || credentials.pass,
        host: credentials.imapHost,
        port: parseInt(credentials.imapPort) || 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000,
      },
    };

    const connection = await imaps.connect(config);
    await connection.openBox('INBOX');
    const mailboxes = await connection.getBoxes();
    await connection.end();

    return {
      success: true,
      mailboxes: Object.keys(mailboxes),
    };
  }
}

module.exports = new ImapPollerService();
