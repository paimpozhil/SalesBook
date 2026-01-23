const { chromium } = require('playwright');
const RSSParser = require('rss-parser');
const prisma = require('../config/database');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Scraper service for collecting leads from various data sources
 */
class ScraperService {
  constructor() {
    this.browser = null;
    this.rssParser = new RSSParser();
  }

  /**
   * Initialize Playwright browser
   */
  async initBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: config.scraper.headless,
      });
      logger.info('Playwright browser initialized');
    }
    return this.browser;
  }

  /**
   * Close browser
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Run a data source scrape job
   * @param {Object} dataSource - Data source record from database
   */
  async run(dataSource) {
    logger.info(`Running scraper for data source: ${dataSource.name}`, {
      type: dataSource.type,
      url: dataSource.url,
    });

    const startTime = Date.now();
    let leadsCollected = 0;
    let error = null;

    try {
      switch (dataSource.type) {
        case 'PLAYWRIGHT':
          leadsCollected = await this.runPlaywrightScraper(dataSource);
          break;
        case 'API':
          leadsCollected = await this.runApiScraper(dataSource);
          break;
        case 'RSS':
          leadsCollected = await this.runRssScraper(dataSource);
          break;
        default:
          throw new Error(`Unknown scraper type: ${dataSource.type}`);
      }

      // Update data source status
      await prisma.dataSource.update({
        where: { id: dataSource.id },
        data: {
          lastRunAt: new Date(),
          lastStatus: 'SUCCESS',
        },
      });

      logger.info(`Scraper completed: ${dataSource.name}`, {
        leadsCollected,
        duration: Date.now() - startTime,
      });
    } catch (err) {
      error = err.message;
      logger.error(`Scraper failed: ${dataSource.name}`, { error: err.message });

      await prisma.dataSource.update({
        where: { id: dataSource.id },
        data: {
          lastRunAt: new Date(),
          lastStatus: 'FAILED',
        },
      });
    }

    return { leadsCollected, error, duration: Date.now() - startTime };
  }

  /**
   * Run Playwright-based scraper
   */
  async runPlaywrightScraper(dataSource) {
    const browser = await this.initBrowser();
    const context = await browser.newContext({
      userAgent: dataSource.config?.userAgent ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    // Set proxy if configured
    if (dataSource.config?.proxy) {
      // Proxy would be set in browser launch options
    }

    const page = await context.newPage();
    page.setDefaultTimeout(config.scraper.timeout);

    let leadsCollected = 0;

    try {
      // Navigate to URL
      logger.info(`Navigating to ${dataSource.url}`);
      await page.goto(dataSource.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Execute custom script if provided
      const scriptConfig = dataSource.config?.script || {};
      logger.info(`Script config: selector=${!!scriptConfig.selector}, code=${!!scriptConfig.code}, codeLength=${scriptConfig.code?.length || 0}`);

      // Default extraction logic - can be customized via config
      if (scriptConfig.selector) {
        const elements = await page.$$(scriptConfig.selector);

        for (const element of elements) {
          try {
            const leadData = await this.extractLeadFromElement(
              page,
              element,
              scriptConfig.fields || {}
            );

            if (leadData && (leadData.companyName || leadData.email)) {
              await this.saveLead(dataSource, leadData);
              leadsCollected++;
            }
          } catch (err) {
            logger.warn('Failed to extract lead from element', { error: err.message });
          }
        }
      } else if (scriptConfig.code) {
        // Execute full Playwright script (not just browser-side code)
        // The script has access to: page, browser, context, logger
        logger.info('Executing custom Playwright script...');
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const scraperFn = new AsyncFunction('page', 'browser', 'context', 'logger', scriptConfig.code);
        const results = await scraperFn(page, browser, context, logger);

        logger.info(`Script returned ${Array.isArray(results) ? results.length : 0} results`);

        if (Array.isArray(results)) {
          for (const leadData of results) {
            if (leadData && (leadData.companyName || leadData.email)) {
              const saved = await this.saveLead(dataSource, leadData);
              if (saved) leadsCollected++;
            }
          }
        }
      } else {
        logger.warn('No script.selector or script.code found in data source config');
      }

      // Handle pagination if configured
      if (scriptConfig.pagination?.nextSelector && leadsCollected > 0) {
        const maxPages = scriptConfig.pagination.maxPages || 5;
        let currentPage = 1;

        while (currentPage < maxPages) {
          const nextButton = await page.$(scriptConfig.pagination.nextSelector);
          if (!nextButton) break;

          await nextButton.click();
          await page.waitForLoadState('networkidle');
          currentPage++;

          // Re-extract leads from new page
          if (scriptConfig.selector) {
            const elements = await page.$$(scriptConfig.selector);
            for (const element of elements) {
              try {
                const leadData = await this.extractLeadFromElement(
                  page,
                  element,
                  scriptConfig.fields || {}
                );
                if (leadData && (leadData.companyName || leadData.email)) {
                  await this.saveLead(dataSource, leadData);
                  leadsCollected++;
                }
              } catch (err) {
                // Continue on individual element errors
              }
            }
          }

          // Rate limiting between pages
          if (scriptConfig.pagination.delay) {
            await page.waitForTimeout(scriptConfig.pagination.delay);
          }
        }
      }
    } finally {
      await context.close();
    }

    return leadsCollected;
  }

  /**
   * Extract lead data from a page element
   */
  async extractLeadFromElement(page, element, fieldConfig) {
    const lead = {};

    for (const [field, selector] of Object.entries(fieldConfig)) {
      try {
        if (typeof selector === 'string') {
          const fieldElement = await element.$(selector);
          if (fieldElement) {
            lead[field] = await fieldElement.textContent();
          }
        } else if (selector.attribute) {
          const fieldElement = await element.$(selector.selector);
          if (fieldElement) {
            lead[field] = await fieldElement.getAttribute(selector.attribute);
          }
        }
      } catch (err) {
        // Field extraction failed, continue
      }
    }

    return lead;
  }

  /**
   * Run API-based scraper
   */
  async runApiScraper(dataSource) {
    const apiConfig = dataSource.config || {};
    const headers = apiConfig.headers || {};

    // Add authentication if configured
    if (apiConfig.auth?.type === 'bearer') {
      headers['Authorization'] = `Bearer ${apiConfig.auth.token}`;
    } else if (apiConfig.auth?.type === 'api_key') {
      headers[apiConfig.auth.headerName || 'X-API-Key'] = apiConfig.auth.key;
    }

    const response = await fetch(dataSource.url, {
      method: apiConfig.method || 'GET',
      headers,
      body: apiConfig.body ? JSON.stringify(apiConfig.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let leadsCollected = 0;

    // Extract leads from response
    let items = data;
    if (apiConfig.dataPath) {
      items = this.getNestedValue(data, apiConfig.dataPath);
    }

    if (!Array.isArray(items)) {
      items = [items];
    }

    // Map fields if configured
    const fieldMapping = apiConfig.fieldMapping || {};

    for (const item of items) {
      const leadData = {};

      for (const [leadField, apiField] of Object.entries(fieldMapping)) {
        leadData[leadField] = this.getNestedValue(item, apiField);
      }

      // If no mapping, try to use item directly
      if (Object.keys(fieldMapping).length === 0) {
        Object.assign(leadData, item);
      }

      if (leadData.companyName || leadData.email || leadData.company_name) {
        leadData.companyName = leadData.companyName || leadData.company_name;
        await this.saveLead(dataSource, leadData);
        leadsCollected++;
      }
    }

    return leadsCollected;
  }

  /**
   * Run RSS feed scraper
   */
  async runRssScraper(dataSource) {
    const feed = await this.rssParser.parseURL(dataSource.url);
    let leadsCollected = 0;

    const rssConfig = dataSource.config || {};

    for (const item of feed.items) {
      // Extract company info from RSS item
      const leadData = {
        companyName: item.title,
        website: item.link,
        notes: item.contentSnippet || item.content,
        source: `RSS: ${feed.title}`,
      };

      // Apply custom field mapping if configured
      if (rssConfig.fieldMapping) {
        for (const [leadField, rssField] of Object.entries(rssConfig.fieldMapping)) {
          leadData[leadField] = item[rssField];
        }
      }

      if (leadData.companyName) {
        await this.saveLead(dataSource, leadData);
        leadsCollected++;
      }
    }

    return leadsCollected;
  }

  /**
   * Save a lead to the database
   */
  async saveLead(dataSource, leadData) {
    // Check for duplicates based on company name or website
    const existing = await prisma.lead.findFirst({
      where: {
        tenantId: dataSource.tenantId,
        OR: [
          leadData.companyName ? { companyName: leadData.companyName } : {},
          leadData.website ? { website: leadData.website } : {},
        ].filter(o => Object.keys(o).length > 0),
      },
    });

    if (existing) {
      logger.debug('Duplicate lead skipped', { companyName: leadData.companyName });
      return null;
    }

    // Store extra fields in customFields (Lead model doesn't have address, city, etc.)
    const customFields = {
      ...(leadData.customFields || {}),
      ...(leadData.notes && { notes: leadData.notes }),
      ...(leadData.city && { city: leadData.city }),
      ...(leadData.address && { address: leadData.address }),
      ...(leadData.state && { state: leadData.state }),
      ...(leadData.country && { country: leadData.country }),
      ...(leadData.postalCode && { postalCode: leadData.postalCode }),
    };

    // Create the lead
    const lead = await prisma.lead.create({
      data: {
        tenantId: dataSource.tenantId,
        sourceId: dataSource.id,
        companyName: leadData.companyName || 'Unknown Company',
        website: leadData.website || null,
        industry: leadData.industry || null,
        size: leadData.size || null,
        status: 'NEW',
        tags: leadData.tags || [],
        customFields: Object.keys(customFields).length > 0 ? customFields : {},
      },
    });

    // Create contact if email/phone provided
    if (leadData.email || leadData.phone || leadData.contactName) {
      await prisma.contact.create({
        data: {
          tenantId: dataSource.tenantId,
          leadId: lead.id,
          name: leadData.contactName || null,
          email: leadData.email || null,
          phone: leadData.phone || null,
          position: leadData.position || null,
          isPrimary: true,
        },
      });
    }

    return lead;
  }

  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

module.exports = new ScraperService();
