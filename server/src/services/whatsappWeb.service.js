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
   */
  async getStatus(tenantId, channelId) {
    const client = this.getClient(tenantId, channelId);
    if (!client || !client.context) {
      return 'DISCONNECTED';
    }

    try {
      // Check if browser is still connected
      if (!client.context.browser() || !client.context.browser().isConnected()) {
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
}

// Export singleton instance
module.exports = new WhatsAppWebService();
