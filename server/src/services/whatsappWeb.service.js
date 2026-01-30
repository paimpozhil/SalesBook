const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * WhatsApp Web Service using Playwright
 * Uses URL-based approach: https://web.whatsapp.com/send?phone=XXX&text=MESSAGE
 * Automatically clicks send button
 * Messages are queued and sent sequentially to avoid race conditions
 */
class WhatsAppWebService {
  constructor() {
    this.browsers = new Map(); // key: "tenantId_channelId" -> { browser, page, context }
    this.qrCallbacks = new Map();
    this.readyCallbacks = new Map();
    this.statusCallbacks = new Map();
    this.messageQueues = new Map(); // key: "tenantId_channelId" -> array of pending messages
    this.isProcessing = new Map(); // key: "tenantId_channelId" -> boolean
    this.qrCodes = new Map(); // key: "tenantId_channelId" -> base64 QR code image
  }

  getKey(tenantId, channelId) {
    return `${tenantId}_${channelId}`;
  }

  /**
   * Initialize browser and login to WhatsApp Web
   * Opens browser for QR code scanning
   */
  async initClient(tenantId, channelId) {
    const key = this.getKey(tenantId, channelId);

    // If browser already exists and is connected, return it
    const existing = this.browsers.get(key);
    if (existing && existing.browser.isConnected()) {
      logger.info(`WhatsApp Web browser already open for ${key}`);
      return existing;
    }

    // Session storage path for persistent login
    const userDataDir = path.join(__dirname, '../../.whatsapp_sessions', key);

    // Create directory if it doesn't exist
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    logger.info(`Launching WhatsApp Web browser for ${key}...`);

    // Launch browser with persistent context (saves login state)
    // Use proper user agent to avoid WhatsApp's browser detection
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: config.scraper.headless, // Use config setting (true for production servers)
      viewport: { width: 1280, height: 800 },
      userAgent: userAgent,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1280,800',
        `--user-agent=${userAgent}`,
      ],
      ignoreDefaultArgs: ['--enable-automation'],
      bypassCSP: true,
    });

    const page = await context.newPage();

    // Add stealth measures to avoid detection
    await page.addInitScript(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Mock platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
      });

      // Remove automation indicators
      window.chrome = { runtime: {} };
    });

    // Navigate to WhatsApp Web
    logger.info(`Navigating to WhatsApp Web for ${key}...`);

    await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded' });

    // Wait for initial page load
    await page.waitForTimeout(3000);

    // Check if already logged in or need QR scan
    const isLoggedIn = await this.waitForLogin(page, key);

    if (isLoggedIn) {
      logger.info(`WhatsApp Web ready for ${key}`);
      const readyCallback = this.readyCallbacks.get(key);
      if (readyCallback) readyCallback();
      const statusCallback = this.statusCallbacks.get(key);
      if (statusCallback) statusCallback('CONNECTED');
    }

    // Store browser reference
    this.browsers.set(key, { browser: context.browser(), context, page });

    return { browser: context.browser(), context, page };
  }

  /**
   * Wait for WhatsApp Web to be logged in
   * Returns true when logged in, handles QR code display
   */
  async waitForLogin(page, key, timeout = 60000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Check multiple selectors for logged-in state (WhatsApp Web changes selectors sometimes)
        const loggedInSelectors = [
          '[data-testid="chat-list"]',
          '[aria-label="Chat list"]',
          'div[data-tab="3"]', // Chat tab
          '#pane-side', // Side pane with chats
          '[data-testid="default-user"]', // User avatar
        ];

        for (const selector of loggedInSelectors) {
          const element = await page.$(selector);
          if (element) {
            logger.info(`WhatsApp logged in detected via: ${selector}`);
            return true;
          }
        }

        // Check for QR code
        const qrSelectors = [
          'canvas[aria-label="Scan this QR code to link a device!"]',
          'canvas[aria-label*="QR"]',
          '[data-testid="qrcode"]',
          'div[data-ref]', // QR code container
          'canvas', // Any canvas (fallback)
        ];

        for (const selector of qrSelectors) {
          const qrElement = await page.$(selector);
          if (qrElement) {
            logger.info(`QR code visible for ${key}`);

            // Capture QR code as base64 image
            try {
              const qrScreenshot = await qrElement.screenshot({ type: 'png' });
              const qrBase64 = qrScreenshot.toString('base64');
              this.qrCodes.set(key, `data:image/png;base64,${qrBase64}`);
            } catch (screenshotError) {
              logger.warn(`Failed to capture QR screenshot: ${screenshotError.message}`);

              // Try full page screenshot as fallback
              try {
                const fullScreenshot = await page.screenshot({ type: 'png' });
                const fullBase64 = fullScreenshot.toString('base64');
                this.qrCodes.set(key, `data:image/png;base64,${fullBase64}`);
              } catch (fullError) {
                logger.error(`Full page screenshot failed: ${fullError.message}`);
              }
            }

            const qrCallback = this.qrCallbacks.get(key);
            if (qrCallback) qrCallback('QR_VISIBLE');

            // Return immediately when QR is detected
            // The polling will handle checking for successful login
            return false;
          }
        }

        await page.waitForTimeout(2000);
      } catch (e) {
        // Page might be loading, continue waiting
        await page.waitForTimeout(1000);
      }
    }

    return false;
  }

  /**
   * Get existing browser/page for tenant/channel
   */
  getClient(tenantId, channelId) {
    const key = this.getKey(tenantId, channelId);
    return this.browsers.get(key);
  }

  /**
   * Initialize for auto-reconnect using saved session
   */
  async initClientHeadless(tenantId, channelId) {
    const key = this.getKey(tenantId, channelId);

    // Check if session folder exists
    const userDataDir = path.join(__dirname, '../../.whatsapp_sessions', key);

    if (!fs.existsSync(userDataDir)) {
      logger.info(`No saved session for ${key}`);
      return null;
    }

    logger.info(`Found saved session for ${key}, launching browser...`);
    return await this.initClient(tenantId, channelId);
  }

  /**
   * Send WhatsApp message - queues message for sequential processing
   * This prevents race conditions when multiple jobs try to send simultaneously
   */
  async sendMessage(tenantId, channelId, phoneNumber, message) {
    const key = this.getKey(tenantId, channelId);

    // Create a promise that will be resolved when the message is processed
    return new Promise((resolve) => {
      // Initialize queue if needed
      if (!this.messageQueues.has(key)) {
        this.messageQueues.set(key, []);
      }

      // Add message to queue
      this.messageQueues.get(key).push({
        phoneNumber,
        message,
        resolve
      });

      logger.info(`Message queued for ${phoneNumber}. Queue size: ${this.messageQueues.get(key).length}`);

      // Start processing if not already running
      this.processMessageQueue(tenantId, channelId);
    });
  }

  /**
   * Process messages in queue one at a time
   */
  async processMessageQueue(tenantId, channelId) {
    const key = this.getKey(tenantId, channelId);

    // If already processing, return (the current processor will handle the queue)
    if (this.isProcessing.get(key)) {
      return;
    }

    this.isProcessing.set(key, true);

    try {
      while (this.messageQueues.get(key)?.length > 0) {
        const item = this.messageQueues.get(key).shift();
        if (!item) break;

        logger.info(`Processing message to ${item.phoneNumber}. Remaining in queue: ${this.messageQueues.get(key).length}`);

        const result = await this.sendMessageInternal(tenantId, channelId, item.phoneNumber, item.message);
        item.resolve(result);

        // Add a small delay between messages
        if (this.messageQueues.get(key).length > 0) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    } finally {
      this.isProcessing.set(key, false);
    }
  }

  /**
   * Internal method that actually sends the message
   * Uses URL-based approach: https://web.whatsapp.com/send?phone=XXX&text=MESSAGE
   * Then clicks send button automatically
   */
  async sendMessageInternal(tenantId, channelId, phoneNumber, message) {
    const key = this.getKey(tenantId, channelId);
    let client = this.getClient(tenantId, channelId);

    // If no browser in memory, try to auto-reconnect
    if (!client || !client.context) {
      logger.info(`No WhatsApp browser for ${key}, attempting auto-reconnect...`);
      try {
        client = await this.initClientHeadless(tenantId, channelId);
        if (!client) {
          return { success: false, error: 'WhatsApp Web not connected. Please connect via channel settings.' };
        }
        // Wait for WhatsApp to fully load
        await client.page.waitForTimeout(5000);
      } catch (error) {
        logger.error('Failed to auto-reconnect WhatsApp:', error);
        return { success: false, error: 'WhatsApp Web not connected. Please connect via channel settings.' };
      }
    }

    const { page } = client;

    // Format phone number (remove spaces, dashes, parentheses, keep + or add country code)
    let formattedNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
    // Remove leading + if present (WhatsApp URL doesn't need it)
    if (formattedNumber.startsWith('+')) {
      formattedNumber = formattedNumber.substring(1);
    }
    // Remove leading zeros
    formattedNumber = formattedNumber.replace(/^0+/, '');

    // URL encode the message
    const encodedMessage = encodeURIComponent(message);

    // WhatsApp Web send URL
    const sendUrl = `https://web.whatsapp.com/send?phone=${formattedNumber}&text=${encodedMessage}`;

    logger.info(`Sending WhatsApp message to ${formattedNumber}...`);
    logger.info(`URL: ${sendUrl.substring(0, 100)}...`);

    try {
      // Navigate to the send URL
      await page.goto(sendUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for page to load and check for invalid number popup
      await page.waitForTimeout(3000);

      // Check if "Phone number shared via url is invalid" popup appears
      const invalidPopup = await page.$('div[data-testid="popup"]');
      if (invalidPopup) {
        const popupText = await invalidPopup.textContent();
        if (popupText && popupText.includes('invalid')) {
          logger.warn(`Invalid phone number: ${phoneNumber}`);
          // Click OK to dismiss
          const okButton = await page.$('div[data-testid="popup"] button');
          if (okButton) await okButton.click();
          return { success: false, error: 'Phone number is invalid or not on WhatsApp' };
        }
      }

      // Wait for the message input and send button to appear
      // The send button appears after the chat loads
      logger.info('Waiting for send button...');

      // Wait for the send button (green arrow button)
      const sendButtonSelector = 'button[data-testid="send"], span[data-testid="send"], button[aria-label="Send"]';

      try {
        await page.waitForSelector(sendButtonSelector, { timeout: 15000 });
      } catch (e) {
        // Try alternative: look for the input field and send button
        const inputField = await page.$('div[data-testid="conversation-compose-box-input"]');
        if (!inputField) {
          logger.error('Could not find message input or send button');
          return { success: false, error: 'WhatsApp chat did not load properly' };
        }
      }

      // Small delay to ensure everything is loaded
      await page.waitForTimeout(1000);

      // Click the send button
      const sendButton = await page.$(sendButtonSelector);
      if (sendButton) {
        await sendButton.click();
        logger.info(`Clicked send button for ${phoneNumber}`);
      } else {
        // Alternative: press Enter in the input field
        logger.info('Send button not found, trying Enter key...');
        await page.keyboard.press('Enter');
      }

      // Wait for message to be sent (check for single/double tick)
      await page.waitForTimeout(2000);

      // Check if message was sent (look for message status indicators)
      const messageSent = await page.$('span[data-testid="msg-check"], span[data-testid="msg-dblcheck"]');

      if (messageSent) {
        logger.info(`WhatsApp message sent successfully to ${phoneNumber}`);
        return {
          success: true,
          messageId: `wa_${Date.now()}_${formattedNumber}`
        };
      }

      // Even if we don't see the tick, if no error occurred, assume success
      logger.info(`WhatsApp message likely sent to ${phoneNumber} (no error detected)`);
      return {
        success: true,
        messageId: `wa_${Date.now()}_${formattedNumber}`
      };

    } catch (error) {
      logger.error('WhatsApp Web send error:', error.message);

      // Check if browser was closed
      if (error.message.includes('Target closed') || error.message.includes('Browser closed')) {
        this.browsers.delete(key);
      }

      return {
        success: false,
        error: error.message || 'Failed to send message'
      };
    }
  }

  /**
   * Get connection status
   * Auto-reconnects if session exists but browser is not running
   */
  async getStatus(tenantId, channelId, autoReconnect = true) {
    const key = this.getKey(tenantId, channelId);
    let client = this.getClient(tenantId, channelId);

    // If no browser running, check if we have a saved session and try to reconnect
    if (!client || !client.context) {
      if (autoReconnect) {
        const sessionPath = path.join(__dirname, '../../.whatsapp_sessions', key);
        if (fs.existsSync(sessionPath)) {
          logger.info(`Auto-reconnecting WhatsApp for ${key} using saved session...`);
          try {
            client = await this.initClient(tenantId, channelId);
            // Wait for page to load
            await client.page.waitForTimeout(5000);
          } catch (error) {
            logger.error(`Auto-reconnect failed for ${key}:`, error.message);
            return 'DISCONNECTED';
          }
        }
      }
      if (!client || !client.context) {
        return 'DISCONNECTED';
      }
    }

    try {
      // Check if browser is still connected
      if (!client.context.browser() || !client.context.browser().isConnected()) {
        this.browsers.delete(key);
        return 'DISCONNECTED';
      }

      // Check multiple selectors for logged-in state
      const loggedInSelectors = [
        '[data-testid="chat-list"]',
        '[aria-label="Chat list"]',
        'div[data-tab="3"]',
        '#pane-side',
        '[data-testid="default-user"]',
      ];

      for (const selector of loggedInSelectors) {
        const element = await client.page.$(selector);
        if (element) {
          return 'CONNECTED';
        }
      }

      return 'DISCONNECTED';
    } catch (error) {
      logger.error('Error getting WhatsApp status:', error);
      return 'DISCONNECTED';
    }
  }

  /**
   * Disconnect and close browser
   */
  async disconnect(tenantId, channelId) {
    const key = this.getKey(tenantId, channelId);
    const client = this.browsers.get(key);

    if (client) {
      try {
        await client.context.close();
      } catch (error) {
        logger.error(`Error closing WhatsApp browser for ${key}:`, error);
      }
      this.browsers.delete(key);
    }

    // Clean up callbacks
    this.qrCallbacks.delete(key);
    this.readyCallbacks.delete(key);
    this.statusCallbacks.delete(key);

    logger.info(`WhatsApp Web disconnected for ${key}`);
  }

  /**
   * Delete session folder permanently
   * This removes all saved authentication data
   */
  async deleteSession(tenantId, channelId) {
    const key = this.getKey(tenantId, channelId);
    const sessionPath = path.join(__dirname, '../../.whatsapp_sessions', key);

    // Ensure browser is disconnected first
    await this.disconnect(tenantId, channelId);

    // Delete session folder if it exists
    if (fs.existsSync(sessionPath)) {
      try {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        logger.info(`WhatsApp session deleted for ${key}`);
        return true;
      } catch (error) {
        logger.error(`Error deleting WhatsApp session for ${key}:`, error);
        throw new Error('Failed to delete session. Please try again.');
      }
    }

    logger.info(`No session folder found for ${key}`);
    return false;
  }

  /**
   * Register QR code callback
   */
  onQR(tenantId, channelId, callback) {
    const key = this.getKey(tenantId, channelId);
    this.qrCallbacks.set(key, callback);
  }

  /**
   * Register ready callback
   */
  onReady(tenantId, channelId, callback) {
    const key = this.getKey(tenantId, channelId);
    this.readyCallbacks.set(key, callback);
  }

  /**
   * Register status change callback
   */
  onStatusChange(tenantId, channelId, callback) {
    const key = this.getKey(tenantId, channelId);
    this.statusCallbacks.set(key, callback);
  }

  /**
   * Get QR code as base64 image
   */
  getQRCode(tenantId, channelId) {
    const key = this.getKey(tenantId, channelId);
    return this.qrCodes.get(key) || null;
  }

  /**
   * Capture fresh QR code from current page
   */
  async captureQRCode(tenantId, channelId) {
    const key = this.getKey(tenantId, channelId);
    const client = this.getClient(tenantId, channelId);

    if (!client || !client.page) {
      return null;
    }

    try {
      // Wait a bit for page to fully render
      await client.page.waitForTimeout(2000);

      const qrSelectors = [
        'canvas[aria-label="Scan this QR code to link a device!"]',
        'canvas[aria-label*="QR"]',
        '[data-testid="qrcode"]',
        'div[data-ref] canvas',
        'canvas', // Try any canvas element
      ];

      for (const selector of qrSelectors) {
        const qrElement = await client.page.$(selector);
        if (qrElement) {
          const qrScreenshot = await qrElement.screenshot({ type: 'png' });
          const qrBase64 = qrScreenshot.toString('base64');
          const qrDataUrl = `data:image/png;base64,${qrBase64}`;
          this.qrCodes.set(key, qrDataUrl);
          return qrDataUrl;
        }
      }

      // If no QR element found, try fallback area selectors
      const qrArea = await client.page.$('div._aoe1, div._akaw');
      if (qrArea) {
        const qrScreenshot = await qrArea.screenshot({ type: 'png' });
        const qrBase64 = qrScreenshot.toString('base64');
        const qrDataUrl = `data:image/png;base64,${qrBase64}`;
        this.qrCodes.set(key, qrDataUrl);
        return qrDataUrl;
      }

      // Last resort: screenshot the entire viewport
      const fullScreenshot = await client.page.screenshot({ type: 'png' });
      const fullBase64 = fullScreenshot.toString('base64');
      const fullDataUrl = `data:image/png;base64,${fullBase64}`;
      this.qrCodes.set(key, fullDataUrl);
      return fullDataUrl;

    } catch (error) {
      logger.error(`Error capturing QR code: ${error.message}`);
      return null;
    }
  }

  /**
   * Get WhatsApp profile info (basic implementation)
   */
  async getProfileInfo(tenantId, channelId) {
    const client = this.getClient(tenantId, channelId);
    if (!client) {
      return null;
    }

    try {
      // Could extract from WhatsApp Web UI if needed
      return {
        phoneNumber: 'Connected',
        name: 'WhatsApp Web',
        platform: 'web'
      };
    } catch (error) {
      logger.error('Error getting WhatsApp profile:', error);
      return null;
    }
  }

  /**
   * Inject WhatsApp Store finder script into page
   * This allows access to WhatsApp's internal data structures
   */
  async injectStore(page) {
    const storeReady = await page.evaluate(async () => {
      // Helper to sleep
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      // Try to find and expose the Store
      async function findStore() {
        // Method 1: Direct window.Store
        if (window.Store && window.Store.Chat) {
          return window.Store;
        }

        // Method 2: Look through webpackChunkwhatsapp_web_client
        const webpackChunks = window.webpackChunkwhatsapp_web_client;
        if (webpackChunks) {
          webpackChunks.push([['scraper'], {}, (req) => {
            const moduleIds = Object.keys(req.m);
            for (const id of moduleIds) {
              try {
                const mod = req(id);
                if (mod && mod.Chat && mod.Contact) {
                  window.Store = mod;
                  return;
                }
                if (mod && mod.default && mod.default.Chat) {
                  window.Store = mod.default;
                  return;
                }
              } catch (e) { }
            }
          }]);
        }

        // Method 3: Search for Store in module cache (require)
        if (window.require) {
          try {
            const store = window.require('WAWebCollections');
            if (store) {
              window.Store = store;
              return store;
            }
          } catch (e) { }
        }

        return window.Store;
      }

      // Try multiple times to find the store
      for (let i = 0; i < 30; i++) {
        const store = await findStore();
        if (store && store.Chat) return true;
        await sleep(1000);
      }
      return false;
    });

    return storeReady;
  }

  /**
   * Get WhatsApp groups from connected session
   * @param {number} tenantId - Tenant ID
   * @param {number} channelId - Channel ID
   * @returns {Array} List of groups with id, name, participantCount
   */
  async getGroups(tenantId, channelId) {
    const key = this.getKey(tenantId, channelId);
    const client = this.getClient(tenantId, channelId);

    if (!client || !client.page) {
      logger.error(`No WhatsApp client found for ${key}`);
      throw new Error('WhatsApp not connected. Please connect first.');
    }

    const { page } = client;

    try {
      // Inject Store if not already done
      logger.info(`Injecting Store for ${key}...`);
      const storeReady = await this.injectStore(page);

      if (!storeReady) {
        throw new Error('Could not access WhatsApp internals. Please refresh the connection.');
      }

      logger.info(`Store injected, fetching groups for ${key}...`);

      // Fetch groups from Store
      const groups = await page.evaluate(() => {
        const store = window.Store;
        if (!store || !store.Chat) return [];

        const chats = store.Chat.getModelsArray ? store.Chat.getModelsArray() : Array.from(store.Chat.models || []);

        return chats
          .filter(chat => {
            return chat.isGroup ||
              (chat.id && chat.id._serialized && chat.id._serialized.includes('@g.us')) ||
              chat.type === 'group';
          })
          .map(chat => {
            let participantCount = 0;
            if (chat.groupMetadata && chat.groupMetadata.participants) {
              const p = chat.groupMetadata.participants;
              participantCount = p.length || (p.getModelsArray ? p.getModelsArray().length : 0);
            }
            return {
              id: chat.id._serialized || chat.id.toString(),
              name: chat.name || chat.formattedTitle || 'Unknown Group',
              participantCount
            };
          });
      });

      // Sort groups by name
      groups.sort((a, b) => a.name.localeCompare(b.name));

      logger.info(`Found ${groups.length} WhatsApp groups for ${key}`);
      return groups;

    } catch (error) {
      logger.error(`Error fetching WhatsApp groups: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get members from a WhatsApp group
   * @param {number} tenantId - Tenant ID
   * @param {number} channelId - Channel ID
   * @param {string} groupId - WhatsApp group ID (e.g., "120363...@g.us")
   * @returns {Array} List of members with id, phone, name, isAdmin
   */
  async getGroupMembers(tenantId, channelId, groupId) {
    const key = this.getKey(tenantId, channelId);
    const client = this.getClient(tenantId, channelId);

    if (!client || !client.page) {
      logger.error(`No WhatsApp client found for ${key}`);
      throw new Error('WhatsApp not connected. Please connect first.');
    }

    const { page } = client;

    try {
      // Ensure Store is injected
      const storeReady = await this.injectStore(page);
      if (!storeReady) {
        throw new Error('Could not access WhatsApp internals. Please refresh the connection.');
      }

      logger.info(`Fetching members for group ${groupId}...`);

      const members = await page.evaluate(async (groupId) => {
        const store = window.Store;
        const chat = store.Chat.get(groupId);

        if (!chat) {
          throw new Error('Group not found');
        }

        // Ensure metadata is loaded
        if (!chat.groupMetadata) {
          if (chat.loadGroupMetadata) await chat.loadGroupMetadata();
        }

        // Wait a bit if still not there
        if (!chat.groupMetadata) {
          await new Promise(r => setTimeout(r, 2000));
        }

        if (!chat.groupMetadata || !chat.groupMetadata.participants) {
          throw new Error('Could not load group participants');
        }

        const participants = chat.groupMetadata.participants.getModelsArray ?
          chat.groupMetadata.participants.getModelsArray() :
          Array.from(chat.groupMetadata.participants);

        return participants.map(p => {
          const id = p.id;

          // Get the serialized ID - this is the most reliable source
          let idStr = '';
          if (id._serialized) {
            idStr = id._serialized;
          } else if (typeof id === 'string') {
            idStr = id;
          } else if (id.toString) {
            idStr = id.toString();
          }

          // Determine if this is a LID (Linked ID) or regular @c.us ID
          // LID format: 123456789@lid or ends with @lid.whatsapp.net
          // Regular format: 919876543210@c.us
          const isLidUser = idStr.includes('@lid') || (id.server && id.server.includes('lid'));

          let phone = '';
          let name = 'Unknown';

          // Try to get contact details from the Store
          let contact = null;
          if (store.Contact) {
            contact = store.Contact.get(id);
            if (contact) {
              // Name extraction
              name = contact.name || contact.pushname || contact.formattedName || contact.verifiedName || 'Unknown';
            }
          }

          // For regular @c.us users, id.user contains the phone number
          if (!isLidUser && id.user) {
            const userStr = String(id.user);
            // Validate it looks like a phone number (7-15 digits)
            if (/^\d{7,15}$/.test(userStr)) {
              phone = userStr;
            }
          }

          // If no phone yet, try contact.phoneNumber
          if (!phone && contact) {
            if (contact.phoneNumber) {
              if (typeof contact.phoneNumber === 'object') {
                // phoneNumber might be a Wid object
                if (contact.phoneNumber.user) {
                  const pnUser = String(contact.phoneNumber.user);
                  if (/^\d{7,15}$/.test(pnUser)) {
                    phone = pnUser;
                  }
                } else if (contact.phoneNumber._serialized) {
                  const pnSer = contact.phoneNumber._serialized;
                  if (pnSer.includes('@c.us')) {
                    const extracted = pnSer.split('@')[0];
                    if (/^\d{7,15}$/.test(extracted)) {
                      phone = extracted;
                    }
                  }
                }
              } else if (typeof contact.phoneNumber === 'string') {
                const cleaned = contact.phoneNumber.replace(/[^\d]/g, '');
                if (/^\d{7,15}$/.test(cleaned)) {
                  phone = cleaned;
                }
              } else if (typeof contact.phoneNumber === 'number') {
                phone = String(contact.phoneNumber);
              }
            }

            // Try userid field
            if (!phone && contact.userid) {
              const uid = String(contact.userid);
              if (/^\d{7,15}$/.test(uid)) {
                phone = uid;
              }
            }

            // Try to get phone from contact's id if it's @c.us format
            if (!phone && contact.id) {
              const cid = contact.id._serialized || contact.id;
              if (typeof cid === 'string' && cid.includes('@c.us')) {
                const extracted = cid.split('@')[0];
                if (/^\d{7,15}$/.test(extracted)) {
                  phone = extracted;
                }
              }
            }
          }

          // Fallback: extract from serialized ID if it's @c.us format (not LID)
          if (!phone && typeof idStr === 'string' && idStr.includes('@c.us')) {
            const parts = idStr.split('@');
            if (parts[0] && /^\d{7,15}$/.test(parts[0])) {
              phone = parts[0];
            }
          }

          // Final cleanup - ensure only digits
          phone = phone.replace(/[^\d]/g, '');

          // Console log for debugging (will show in browser console)
          console.log('WhatsApp member extraction:', {
            idStr,
            isLidUser,
            idUser: id.user,
            extractedPhone: phone,
            name,
            hasContact: !!contact
          });

          return {
            id: idStr,
            phone: phone,  // Will be empty string for LID users without visible phone
            name: name,
            isAdmin: p.isAdmin || false,
            isSuperAdmin: p.isSuperAdmin || false
          };
        });
      }, groupId);

      logger.info(`Found ${members.length} members in group ${groupId}`);
      return members;

    } catch (error) {
      logger.error(`Error fetching group members: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get chat messages with a specific user
   * @param {number} tenantId - Tenant ID
   * @param {number} channelId - Channel ID
   * @param {string} chatId - WhatsApp chat ID (e.g., "919876543210@c.us")
   * @param {number} limit - Maximum number of messages to fetch
   * @returns {Array} List of messages with id, content, timestamp, fromMe
   */
  async getChatMessages(tenantId, channelId, chatId, limit = 20) {
    const key = this.getKey(tenantId, channelId);
    const client = this.getClient(tenantId, channelId);

    if (!client || !client.page) {
      logger.error(`No WhatsApp client found for ${key}`);
      throw new Error('WhatsApp not connected. Please connect first.');
    }

    const { page } = client;

    try {
      // Ensure Store is injected
      const storeReady = await this.injectStore(page);
      if (!storeReady) {
        throw new Error('Could not access WhatsApp internals. Please refresh the connection.');
      }

      logger.info(`Fetching messages for chat ${chatId}...`);

      // Playwright requires arguments to be wrapped in a single object
      const messages = await page.evaluate(async ({ chatId, limit }) => {
        const store = window.Store;

        // Debug: log available chats
        const allChats = store.Chat.getModelsArray ? store.Chat.getModelsArray() : Array.from(store.Chat.models || []);
        console.log(`Total chats in Store: ${allChats.length}`);

        // Try to find the chat
        let chat = store.Chat.get(chatId);

        // If not found, try searching by user ID portion
        if (!chat) {
          const userPart = chatId.split('@')[0];
          console.log(`Chat ${chatId} not found directly, searching for user: ${userPart}`);

          // Search through all chats for a matching ID
          chat = allChats.find(c => {
            const cid = c.id?._serialized || c.id?.user || '';
            return cid.includes(userPart) || (c.id?.user && c.id.user === userPart);
          });

          if (chat) {
            console.log(`Found chat via search: ${chat.id?._serialized}`);
          }
        }

        if (!chat) {
          console.log(`Chat ${chatId} not found in Store. Available individual chats:`,
            allChats.filter(c => !c.isGroup).slice(0, 10).map(c => ({
              id: c.id?._serialized,
              name: c.name || c.formattedTitle
            }))
          );
          return { found: false, messages: [], debug: `Chat ${chatId} not in Store` };
        }

        console.log(`Found chat: ${chat.id?._serialized}, name: ${chat.name || chat.formattedTitle}`);

        // Load more messages if needed
        if (chat.msgs && chat.msgs.length < limit) {
          try {
            if (chat.loadEarlierMsgs) {
              await chat.loadEarlierMsgs();
              console.log('Loaded earlier messages');
            }
          } catch (e) {
            console.log('Failed to load earlier messages:', e.message);
          }
        }

        // Get messages
        const msgs = chat.msgs ?
          (chat.msgs.getModelsArray ? chat.msgs.getModelsArray() : Array.from(chat.msgs)) :
          [];

        console.log(`Chat has ${msgs.length} total messages`);

        // Sort by timestamp descending and take limit
        const result = msgs
          .filter(m => m.type === 'chat' || m.type === 'text') // Only text messages
          .sort((a, b) => (b.t || 0) - (a.t || 0))
          .slice(0, limit)
          .map(m => ({
            id: m.id?._serialized || m.id?.id || String(m.id),
            content: m.body || m.text || '',
            timestamp: m.t ? m.t * 1000 : Date.now(), // Convert to milliseconds
            fromMe: m.fromMe || false,
            type: m.type || 'chat'
          }));

        console.log(`Returning ${result.length} text messages`);
        return { found: true, messages: result };
      }, { chatId, limit });

      if (!messages.found) {
        logger.warn(`Chat ${chatId} not found: ${messages.debug}`);
        return [];
      }

      logger.info(`Found ${messages.messages.length} messages in chat ${chatId}`);
      return messages.messages;

    } catch (error) {
      logger.error(`Error fetching chat messages: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check for new incoming messages from a specific user since a given timestamp
   * @param {number} tenantId - Tenant ID
   * @param {number} channelId - Channel ID
   * @param {string} chatId - WhatsApp chat ID
   * @param {number} sinceTimestamp - Check messages after this timestamp (ms)
   * @returns {Array} New incoming messages
   */
  async getNewIncomingMessages(tenantId, channelId, chatId, sinceTimestamp) {
    const messages = await this.getChatMessages(tenantId, channelId, chatId, 50);

    // Filter for incoming messages (not from me) after the given timestamp
    return messages.filter(m => !m.fromMe && m.timestamp > sinceTimestamp);
  }
}

// Export singleton instance
module.exports = new WhatsAppWebService();
