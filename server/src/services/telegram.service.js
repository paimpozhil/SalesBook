const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { computeCheck } = require('telegram/Password');
const logger = require('../utils/logger');

/**
 * TelegramService - Manages Telegram client connections
 *
 * CONNECTION MODEL:
 * -----------------
 * Telegram uses MTProto protocol which requires a persistent TCP connection.
 * Unlike REST APIs, we can't just make requests - we need an active connection.
 *
 * Why we maintain connections:
 * - Send campaign messages to prospects
 * - Poll for replies (every 5 minutes via cron)
 * - Fetch group members for import
 * - Any Telegram API operation requires active connection
 *
 * Session vs Connection:
 * - Session (sessionString): Auth tokens stored in DB, survives server restarts
 * - Connection (client): Active TCP connection to Telegram servers, lost on restart
 *
 * Lifecycle:
 * 1. Server starts → Auto-reconnect using saved sessions from DB
 * 2. Connection active → Can send messages, poll replies, etc.
 * 3. Server stops → Connections lost, but sessions saved in DB
 * 4. Server restarts → Auto-reconnect again
 *
 * Disconnect vs Delete Session:
 * - Disconnect: Closes connection, keeps session in DB (quick reconnect possible)
 * - Delete Session: Logs out from Telegram, clears session (fresh login required)
 */
class TelegramService {
  constructor() {
    this.clients = new Map(); // sessionKey -> TelegramClient
    this.pendingAuths = new Map(); // sessionKey -> { client, phoneCodeHash }
  }

  getSessionKey(tenantId, apiId) {
    return `${tenantId}_${apiId}`;
  }

  /**
   * Step 1: Initialize client and send phone code
   * @param {number} tenantId - Tenant ID
   * @param {string} apiId - Telegram API ID
   * @param {string} apiHash - Telegram API Hash
   * @param {string} phoneNumber - Phone number with country code
   * @param {string} savedSessionString - Optional saved session string from DB
   */
  async startAuth(tenantId, apiId, apiHash, phoneNumber, savedSessionString = '') {
    const sessionKey = this.getSessionKey(tenantId, apiId);

    // Use saved session from DB if provided
    const stringSession = new StringSession(savedSessionString || '');

    const client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });

    await client.connect();

    // Check if already authorized
    if (await client.isUserAuthorized()) {
      this.clients.set(sessionKey, client);
      logger.info(`Telegram already authorized for ${sessionKey}`);
      // Return the session string so it can be saved to DB
      return { status: 'authorized', sessionKey, sessionString: client.session.save() };
    }

    // Send phone code
    logger.info(`Sending Telegram code to ${phoneNumber} for ${sessionKey}`);

    try {
      const result = await client.sendCode(
        { apiId: parseInt(apiId), apiHash },
        phoneNumber
      );

      logger.info(`Telegram sendCode result for ${sessionKey}:`, {
        phoneCodeHash: result.phoneCodeHash ? 'received' : 'missing',
        type: result.type?.className,
      });

      // Store pending auth
      this.pendingAuths.set(sessionKey, {
        client,
        phoneNumber,
        phoneCodeHash: result.phoneCodeHash,
        apiId,
        apiHash,
      });

      logger.info(`Telegram phone code sent for ${sessionKey}`);
      return { status: 'code_required', sessionKey };
    } catch (error) {
      logger.error(`Telegram sendCode error for ${sessionKey}:`, {
        errorMessage: error.errorMessage,
        message: error.message,
      });

      if (error.errorMessage === 'PHONE_NUMBER_INVALID') {
        throw new Error('Invalid phone number format. Use international format: +91XXXXXXXXXX');
      }
      if (error.errorMessage === 'PHONE_NUMBER_BANNED') {
        throw new Error('This phone number has been banned from Telegram.');
      }
      if (error.errorMessage === 'PHONE_NUMBER_FLOOD') {
        throw new Error('Too many attempts. Please wait before trying again.');
      }

      throw error;
    }
  }

  /**
   * Step 2: Verify phone code
   */
  async verifyCode(sessionKey, code) {
    const pending = this.pendingAuths.get(sessionKey);
    if (!pending) {
      throw new Error('No pending authentication found. Please start over.');
    }

    const { client, phoneNumber, phoneCodeHash, apiId, apiHash } = pending;

    // Ensure client is still connected
    if (!client.connected) {
      logger.info(`Telegram client reconnecting for ${sessionKey}`);
      await client.connect();
    }

    // Clean the code - remove spaces and ensure it's a string
    const cleanCode = String(code).replace(/\s/g, '').trim();

    logger.info(`Telegram verifyCode attempt for ${sessionKey}`, { phoneNumber, codeLength: cleanCode.length, connected: client.connected });

    try {
      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber,
          phoneCodeHash,
          phoneCode: cleanCode,
        })
      );

      logger.info(`Telegram SignIn result for ${sessionKey}:`, { type: result.className });

      // Move to active clients and return session string for DB storage
      this.clients.set(sessionKey, client);
      this.pendingAuths.delete(sessionKey);

      logger.info(`Telegram verified for ${sessionKey}`);
      return { status: 'authorized', sessionKey, sessionString: client.session.save() };
    } catch (error) {
      // Log all error properties for debugging
      logger.error(`Telegram verifyCode error for ${sessionKey}:`, {
        errorMessage: error.errorMessage,
        message: error.message,
        code: error.code,
        className: error.className,
        name: error.name,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });

      // Check for 2FA requirement - check multiple possible property names/values
      const errorMsg = error.errorMessage || error.message || '';
      const is2FARequired =
        errorMsg === 'SESSION_PASSWORD_NEEDED' ||
        errorMsg.includes('SESSION_PASSWORD_NEEDED') ||
        error.code === 401 && errorMsg.includes('password');

      if (is2FARequired) {
        logger.info(`Telegram 2FA required for ${sessionKey}`);
        return { status: 'password_required', sessionKey };
      }

      // Provide more specific error messages
      if (errorMsg === 'PHONE_CODE_INVALID' || errorMsg.includes('PHONE_CODE_INVALID')) {
        throw new Error('Invalid verification code. Please check the code and try again.');
      }
      if (errorMsg === 'PHONE_CODE_EXPIRED' || errorMsg.includes('PHONE_CODE_EXPIRED')) {
        throw new Error('Verification code has expired. Please request a new code.');
      }
      if (errorMsg === 'PHONE_CODE_EMPTY' || errorMsg.includes('PHONE_CODE_EMPTY')) {
        throw new Error('Please enter the verification code.');
      }

      throw error;
    }
  }

  /**
   * Step 3: Verify 2FA password (if required)
   */
  async verifyPassword(sessionKey, password) {
    const pending = this.pendingAuths.get(sessionKey);
    if (!pending) {
      throw new Error('No pending authentication found. Please start over.');
    }

    const { client } = pending;

    try {
      // Get password info
      const passwordInfo = await client.invoke(new Api.account.GetPassword());

      // Compute password check using GramJS Password module
      const passwordCheck = await computeCheck(passwordInfo, password);

      // Sign in with password
      await client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));

      // Move to active clients and return session string for DB storage
      this.clients.set(sessionKey, client);
      this.pendingAuths.delete(sessionKey);

      logger.info(`Telegram 2FA verified for ${sessionKey}`);
      return { status: 'authorized', sessionKey, sessionString: client.session.save() };
    } catch (error) {
      logger.error(`Telegram verifyPassword error for ${sessionKey}:`, {
        errorMessage: error.errorMessage,
        message: error.message,
      });

      if (error.errorMessage === 'PASSWORD_HASH_INVALID') {
        throw new Error('Invalid password. Please check your 2FA password and try again.');
      }

      throw error;
    }
  }

  /**
   * Get list of groups/channels the user is member of
   */
  async getGroups(sessionKey) {
    const client = this.clients.get(sessionKey);
    if (!client) {
      throw new Error('Not authenticated. Please login first.');
    }

    const dialogs = await client.getDialogs({ limit: 100 });

    // Filter for groups and channels
    const groups = dialogs
      .filter(dialog => dialog.isGroup || dialog.isChannel)
      .map(dialog => ({
        id: dialog.id.toString(),
        name: dialog.title || dialog.name,
        type: dialog.isChannel ? 'channel' : 'group',
        participantsCount: dialog.entity?.participantsCount || 0,
        username: dialog.entity?.username || null,
      }));

    logger.info(`Found ${groups.length} groups for ${sessionKey}`);
    return groups;
  }

  /**
   * Get participants/contacts from a group
   */
  async getGroupContacts(sessionKey, groupId) {
    const client = this.clients.get(sessionKey);
    if (!client) {
      throw new Error('Not authenticated. Please login first.');
    }

    const entity = await client.getEntity(groupId);
    const contacts = [];

    try {
      // Get participants
      const participants = await client.getParticipants(entity, { limit: 500 });

      for (const participant of participants) {
        if (participant.id && !participant.bot) {
          contacts.push({
            id: participant.id.toString(),
            firstName: participant.firstName || '',
            lastName: participant.lastName || '',
            username: participant.username || null,
            phone: participant.phone || null,
            accessHash: participant.accessHash?.toString() || null,
          });
        }
      }
    } catch (error) {
      logger.error(`Error getting participants: ${error.message}`);

      // Try alternative method for channels
      if (error.errorMessage === 'CHAT_ADMIN_REQUIRED') {
        throw new Error('Admin access required to get participants from this group/channel');
      }
      throw error;
    }

    logger.info(`Found ${contacts.length} contacts in group for ${sessionKey}`);
    return contacts;
  }

  /**
   * Send message to a user
   */
  async sendMessage(sessionKey, userId, message) {
    const client = this.clients.get(sessionKey);
    if (!client) {
      throw new Error('Not authenticated. Please login first.');
    }

    try {
      const result = await client.sendMessage(userId, { message });
      return { success: true, messageId: result.id };
    } catch (error) {
      logger.error(`Telegram send error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if session is valid (client in memory)
   * @param {string} sessionKey - Session identifier
   * @param {boolean} hasStoredSession - Whether there's a session stored in DB
   */
  async isAuthorized(sessionKey, hasStoredSession = false) {
    const client = this.clients.get(sessionKey);
    if (!client) {
      // Client not in memory - needs reconnect using DB session
      return { authorized: false, hasSession: hasStoredSession };
    }

    try {
      const authorized = await client.isUserAuthorized();
      return { authorized, hasSession: true };
    } catch {
      return { authorized: false, hasSession: false };
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(sessionKey) {
    const client = this.clients.get(sessionKey);
    if (client) {
      await client.disconnect();
      this.clients.delete(sessionKey);
    }
    this.pendingAuths.delete(sessionKey);
  }

  /**
   * Reconnect using session string from DB
   * @param {number} tenantId - Tenant ID
   * @param {string} apiId - Telegram API ID
   * @param {string} apiHash - Telegram API Hash
   * @param {string} sessionString - Session string from DB
   */
  async reconnect(tenantId, apiId, apiHash, sessionString) {
    const sessionKey = this.getSessionKey(tenantId, apiId);

    if (!sessionString) {
      throw new Error('No saved session found');
    }

    const stringSession = new StringSession(sessionString);

    const client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });

    await client.connect();

    if (await client.isUserAuthorized()) {
      this.clients.set(sessionKey, client);
      logger.info(`Telegram reconnected for ${sessionKey}`);
      return { status: 'authorized', sessionKey };
    }

    throw new Error('Session expired. Please login again.');
  }

  /**
   * Auto-reconnect all Telegram channels on server startup
   * @param {Array} channels - Array of channel configs with decrypted credentials
   */
  async autoReconnectAll(channels) {
    logger.info(`Auto-reconnecting ${channels.length} Telegram channels...`);

    const results = [];
    for (const channel of channels) {
      try {
        const { tenantId, credentials } = channel;
        const { apiId, apiHash, sessionString } = credentials;

        if (!sessionString) {
          logger.warn(`Channel ${channel.id} has no saved session, skipping`);
          results.push({ channelId: channel.id, status: 'skipped', reason: 'no session' });
          continue;
        }

        await this.reconnect(tenantId, apiId, apiHash, sessionString);
        logger.info(`Auto-reconnected Telegram channel ${channel.id}`);
        results.push({ channelId: channel.id, status: 'connected' });
      } catch (error) {
        logger.error(`Failed to auto-reconnect channel ${channel.id}: ${error.message}`);
        results.push({ channelId: channel.id, status: 'failed', error: error.message });
      }
    }

    return results;
  }

  /**
   * Get messages from a specific user (for reply detection)
   * @param {string} sessionKey - Session identifier
   * @param {string} userId - Telegram user ID
   * @param {number} minId - Minimum message ID (to get only newer messages)
   * @returns {Array} Array of messages from the user
   */
  async getMessagesFromUser(sessionKey, userId, minId = 0) {
    const client = this.clients.get(sessionKey);
    if (!client) {
      throw new Error('Not authenticated. Please login first.');
    }

    try {
      // Try to get entity - handle both numeric ID and username
      let entity;
      try {
        // First try as numeric ID
        const numericId = parseInt(userId, 10);
        if (!isNaN(numericId)) {
          entity = await client.getEntity(numericId);
        } else {
          entity = await client.getEntity(userId);
        }
      } catch (entityError) {
        logger.warn(`Could not get entity for ${userId}, trying InputPeerUser: ${entityError.message}`);
        // Try with InputPeerUser if direct entity fails
        entity = new Api.InputPeerUser({
          userId: BigInt(userId),
          accessHash: BigInt(0), // Will be resolved by Telegram
        });
      }

      logger.info(`Getting messages from user ${userId}, minId: ${minId}`);

      // Get messages - don't use minId filter, we'll filter in code for better reliability
      const messages = await client.getMessages(entity, {
        limit: 100,
      });

      logger.info(`Retrieved ${messages.length} total messages from conversation with ${userId}`);

      // Get our own ID to filter out our messages
      const me = await client.getMe();
      const myId = me.id.toString();

      // Filter for inbound messages only (from the user, not from us)
      // and newer than minId
      const inboundMessages = messages
        .filter(msg => {
          // Check if message is from the other user (not us)
          const senderId = msg.fromId?.userId?.toString() || msg.senderId?.toString();
          const isFromUser = senderId && senderId !== myId;

          // Check if message is newer than minId
          const isNewer = minId === 0 || msg.id > minId;

          // Log for debugging
          if (msg.text || msg.message) {
            logger.debug(`Message ${msg.id}: from=${senderId}, myId=${myId}, isFromUser=${isFromUser}, isNewer=${isNewer}, text="${(msg.text || msg.message || '').substring(0, 50)}"`);
          }

          return isFromUser && isNewer && (msg.text || msg.message);
        })
        .map(msg => ({
          id: msg.id,
          text: msg.text || msg.message || '',
          date: msg.date,
          fromId: msg.fromId?.userId?.toString() || msg.senderId?.toString(),
        }));

      logger.info(`Found ${inboundMessages.length} inbound messages from user ${userId} (newer than ${minId})`);

      if (inboundMessages.length > 0) {
        logger.info(`First reply: "${inboundMessages[0].text.substring(0, 100)}"`);
      }

      return inboundMessages;
    } catch (error) {
      logger.error(`Error getting messages from user ${userId}: ${error.message}`, {
        stack: error.stack,
      });
      return []; // Return empty array instead of throwing to not break the polling loop
    }
  }

  /**
   * Delete session completely (logout from Telegram)
   * @param {string} sessionKey - Session identifier
   * Note: Caller should also clear sessionString from DB credentials
   */
  async deleteSession(sessionKey) {
    const client = this.clients.get(sessionKey);

    if (client) {
      try {
        // Log out from Telegram
        await client.invoke(new Api.auth.LogOut());
      } catch (error) {
        logger.warn(`Error logging out from Telegram: ${error.message}`);
      }
      await client.disconnect();
      this.clients.delete(sessionKey);
    }

    // Remove pending auth if exists
    this.pendingAuths.delete(sessionKey);

    logger.info(`Deleted Telegram session for ${sessionKey}`);
    return { deleted: true };
  }

  /**
   * Get client for a session (used by other services)
   * @param {string} sessionKey - Session identifier
   * @returns {TelegramClient|null}
   */
  getClient(sessionKey) {
    return this.clients.get(sessionKey) || null;
  }
}

module.exports = new TelegramService();
