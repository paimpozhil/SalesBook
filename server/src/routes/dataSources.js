const express = require('express');
const { body, param, query } = require('express-validator');
const { chromium } = require('playwright');
const RSSParser = require('rss-parser');
const multer = require('multer');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, addTenantFilter, getTenantId } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { success, paginated, noContent, created } = require('../utils/response');
const logger = require('../utils/logger');
const industryService = require('../services/industry.service');

// Configure multer for file uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['application/json', 'text/plain'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.json$/i)) {
      cb(null, true);
    } else {
      cb(new AppError('Only JSON files are allowed', 400), false);
    }
  },
});

const MAX_LEADS_PER_UPLOAD = 10000;

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/data-sources
 * @desc    List data sources
 * @access  Private
 */
router.get(
  '/',
  requirePermission('sources:read'),
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('type').optional().isIn(['PLAYWRIGHT', 'API', 'RSS', 'MANUAL', 'JSON', 'CSV']),
    query('isActive').optional().isBoolean().toBoolean(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    const where = addTenantFilter(req, {});

    if (req.query.type) where.type = req.query.type;
    if (req.query.isActive !== undefined) where.isActive = req.query.isActive;

    const [sources, total] = await Promise.all([
      prisma.dataSource.findMany({
        where,
        select: {
          id: true,
          name: true,
          type: true,
          url: true,
          isActive: true,
          lastRunAt: true,
          lastStatus: true,
          pollingFrequency: true,
          rateLimit: true,
          fileName: true,
          fileSize: true,
          recordCount: true,
          createdAt: true,
          _count: { select: { leads: true, runs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dataSource.count({ where }),
    ]);

    return paginated(res, sources, page, limit, total);
  })
);

/**
 * @route   POST /api/v1/data-sources
 * @desc    Create data source
 * @access  Private
 */
router.post(
  '/',
  requirePermission('sources:create'),
  [
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('type').isIn(['PLAYWRIGHT', 'API', 'RSS', 'MANUAL']),
    body('url').isURL(),
    body('config').isObject(),
    body('rateLimit').optional().isInt({ min: 1 }),
    body('pollingFrequency').optional(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name, type, url, config, proxyConfig, rateLimit, pollingFrequency } = req.body;

    const source = await prisma.dataSource.create({
      data: {
        tenantId: getTenantId(req),
        name,
        type,
        url,
        config,
        proxyConfig,
        rateLimit,
        pollingFrequency,
      },
    });

    return created(res, source);
  })
);

/**
 * @route   GET /api/v1/data-sources/:id
 * @desc    Get data source
 * @access  Private
 */
router.get(
  '/:id',
  requirePermission('sources:read'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const source = await prisma.dataSource.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: {
        _count: { select: { leads: true, runs: true } },
      },
    });

    if (!source) throw AppError.notFound('Data source not found');

    return success(res, source);
  })
);

/**
 * @route   PATCH /api/v1/data-sources/:id
 * @desc    Update data source
 * @access  Private
 */
router.patch(
  '/:id',
  requirePermission('sources:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const { name, url, config, proxyConfig, rateLimit, pollingFrequency, isActive } = req.body;

    const existing = await prisma.dataSource.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) throw AppError.notFound('Data source not found');

    const source = await prisma.dataSource.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(url && { url }),
        ...(config && { config }),
        ...(proxyConfig !== undefined && { proxyConfig }),
        ...(rateLimit !== undefined && { rateLimit }),
        ...(pollingFrequency !== undefined && { pollingFrequency }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return success(res, source);
  })
);

/**
 * @route   DELETE /api/v1/data-sources/:id
 * @desc    Delete data source
 * @access  Private
 */
router.delete(
  '/:id',
  requirePermission('sources:delete'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const existing = await prisma.dataSource.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) throw AppError.notFound('Data source not found');

    await prisma.dataSource.delete({ where: { id: req.params.id } });

    return noContent(res);
  })
);

/**
 * @route   POST /api/v1/data-sources/:id/run
 * @desc    Trigger manual run
 * @access  Private
 */
router.post(
  '/:id/run',
  requirePermission('sources:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const source = await prisma.dataSource.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!source) throw AppError.notFound('Data source not found');

    // Create a job to run the scraper
    const job = await prisma.jobQueue.create({
      data: {
        tenantId: source.tenantId,
        type: 'SCRAPE',
        payload: { dataSourceId: source.id },
        priority: 1,
      },
    });

    return success(res, { message: 'Scrape job queued', jobId: job.id });
  })
);

/**
 * @route   GET /api/v1/data-sources/:id/runs
 * @desc    Get run history
 * @access  Private
 */
router.get(
  '/:id/runs',
  requirePermission('sources:read'),
  [
    param('id').isInt().toInt(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    // Verify source belongs to tenant
    const source = await prisma.dataSource.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!source) throw AppError.notFound('Data source not found');

    const [runs, total] = await Promise.all([
      prisma.dataSourceRun.findMany({
        where: { dataSourceId: req.params.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dataSourceRun.count({ where: { dataSourceId: req.params.id } }),
    ]);

    return paginated(res, runs, page, limit, total);
  })
);

/**
 * @route   POST /api/v1/data-sources/preview
 * @desc    Preview scraper results without saving (for testing scripts)
 * @access  Private
 */
router.post(
  '/preview',
  requirePermission('sources:create'),
  [
    body('url').isURL(),
    body('type').isIn(['PLAYWRIGHT', 'API', 'RSS']),
    body('script').optional().isString(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { url, type, script } = req.body;
    let results = [];
    let error = null;

    try {
      if (type === 'PLAYWRIGHT') {
        results = await previewPlaywrightScraper(url, script);
      } else if (type === 'API') {
        results = await previewApiScraper(url, req.body.config);
      } else if (type === 'RSS') {
        results = await previewRssScraper(url);
      }
    } catch (err) {
      logger.error('Preview scraper failed', { error: err.message });
      error = err.message;
    }

    return success(res, { results, error, count: results.length });
  })
);

/**
 * @route   POST /api/v1/data-sources/import
 * @desc    Import previewed leads into the database
 * @access  Private
 */
router.post(
  '/import',
  requirePermission('sources:create'),
  [
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('url').isURL(),
    body('type').isIn(['PLAYWRIGHT', 'API', 'RSS']),
    body('script').optional().isString(),
    body('leads').isArray({ min: 1 }),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name, url, type, script, leads } = req.body;
    let tenantId = getTenantId(req);

    // Ensure tenantId is available (required for import)
    if (!tenantId) {
      tenantId = req.body.tenantId ? parseInt(req.body.tenantId, 10) : req.user?.tenantId;
      if (!tenantId) {
        throw AppError.badRequest('Tenant ID is required for import');
      }
    }

    // Create the data source
    const dataSource = await prisma.dataSource.create({
      data: {
        tenantId,
        name,
        type,
        url,
        config: { script: { code: script } },
        isActive: true,
      },
    });

    // Import leads
    let imported = 0;
    let skipped = 0;

    for (const leadData of leads) {
      // Check for duplicates
      const existing = await prisma.lead.findFirst({
        where: {
          tenantId,
          OR: [
            leadData.companyName ? { companyName: leadData.companyName } : {},
            leadData.website ? { website: leadData.website } : {},
          ].filter(o => Object.keys(o).length > 0),
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Create lead - store extra fields in customFields
      const customFields = {
        ...(leadData.customFields || {}),
        ...(leadData.notes && { notes: leadData.notes }),
        ...(leadData.city && { city: leadData.city }),
        ...(leadData.address && { address: leadData.address }),
        ...(leadData.state && { state: leadData.state }),
        ...(leadData.country && { country: leadData.country }),
      };

      const lead = await prisma.lead.create({
        data: {
          tenantId,
          sourceId: dataSource.id,
          createdById: req.user?.id,
          companyName: leadData.companyName || 'Unknown Company',
          website: leadData.website || null,
          industry: leadData.industry || null,
          size: leadData.size || null,
          status: 'NEW',
          tags: leadData.tags || [],
          customFields: Object.keys(customFields).length > 0 ? customFields : {},
        },
      });

      // Create contact if provided
      if (leadData.email || leadData.phone || leadData.contactName) {
        await prisma.contact.create({
          data: {
            tenantId,
            leadId: lead.id,
            name: leadData.contactName || null,
            email: leadData.email,
            phone: leadData.phone,
            position: leadData.position,
            isPrimary: true,
          },
        });
      }

      imported++;
    }

    return created(res, {
      dataSource,
      imported,
      skipped,
      total: leads.length,
    });
  })
);

/**
 * @route   POST /api/v1/data-sources/upload
 * @desc    Upload and parse JSON file for preview
 * @access  Private
 */
router.post(
  '/upload',
  requirePermission('sources:create'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw AppError.badRequest('No file uploaded');
    }

    const { originalname, size, buffer } = req.file;
    const fileContent = buffer.toString('utf8');
    let records = [];

    try {
      records = JSON.parse(fileContent);
      if (!Array.isArray(records)) {
        throw new Error('JSON must be an array of objects');
      }
    } catch (err) {
      throw AppError.badRequest(`Failed to parse JSON file: ${err.message}`);
    }

    if (records.length > MAX_LEADS_PER_UPLOAD) {
      throw AppError.badRequest(`File contains ${records.length} records. Maximum allowed is ${MAX_LEADS_PER_UPLOAD}`);
    }

    // Transform records to standard format
    const leads = records.map((record, index) => transformRecord(record, index));

    // Return preview (first 100 for display)
    return success(res, {
      fileName: originalname,
      fileSize: size,
      fileType: 'JSON',
      totalRecords: records.length,
      preview: leads.slice(0, 100),
      leads, // All leads for import
    });
  })
);

/**
 * @route   POST /api/v1/data-sources/file-import
 * @desc    Import leads from uploaded file data
 * @access  Private
 */
router.post(
  '/file-import',
  requirePermission('sources:create'),
  [
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('fileName').trim().isLength({ min: 1, max: 255 }),
    body('fileSize').isInt({ min: 1 }),
    body('fileType').isIn(['JSON']),
    body('leads').isArray({ min: 1, max: MAX_LEADS_PER_UPLOAD }),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name, fileName, fileSize, fileType, leads } = req.body;
    let tenantId = getTenantId(req);

    if (!tenantId) {
      throw AppError.badRequest('Tenant ID is required for import');
    }

    // Create the data source
    const dataSource = await prisma.dataSource.create({
      data: {
        tenantId,
        name,
        type: fileType,
        fileName,
        fileSize,
        recordCount: leads.length,
        isActive: false, // File imports don't run
        config: {},
      },
    });

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const leadData of leads) {
      try {
        // Check for duplicates by company name or website
        const duplicateConditions = [];
        if (leadData.companyName) {
          duplicateConditions.push({ companyName: leadData.companyName });
        }
        if (leadData.website) {
          duplicateConditions.push({ website: leadData.website });
        }

        if (duplicateConditions.length > 0) {
          const existing = await prisma.lead.findFirst({
            where: {
              tenantId,
              isDeleted: false,
              OR: duplicateConditions,
            },
          });

          if (existing) {
            skipped++;
            continue;
          }
        }

        // Store extra fields in customFields
        const customFields = {
          ...(leadData.location && { location: leadData.location }),
          ...(leadData.isMarketplace !== undefined && { isMarketplace: leadData.isMarketplace }),
          ...(leadData.marketplaceName && { marketplaceName: leadData.marketplaceName }),
          ...(leadData.websiteStatus && { websiteStatus: leadData.websiteStatus }),
        };

        // Create lead
        const lead = await prisma.lead.create({
          data: {
            tenantId,
            sourceId: dataSource.id,
            createdById: req.user?.id,
            companyName: leadData.companyName || 'Unknown Company',
            website: leadData.website || null,
            size: leadData.size || null,
            status: 'NEW',
            tags: leadData.tags || [],
            customFields: Object.keys(customFields).length > 0 ? customFields : {},
          },
        });

        // Handle industries (companyType array)
        if (leadData.companyType && Array.isArray(leadData.companyType) && leadData.companyType.length > 0) {
          const industries = await industryService.getOrCreateIndustries(tenantId, leadData.companyType);
          if (industries.length > 0) {
            await industryService.linkIndustriesToLead(lead.id, industries.map(i => i.id));
          }
        }

        // Create contacts
        if (leadData.contacts && Array.isArray(leadData.contacts)) {
          // Filter valid contacts (must have email or phone)
          const validContacts = leadData.contacts.filter(c => c.email || c.phone);

          // Find the best contact to be primary (prioritize: name + email + position)
          let primaryIndex = 0;
          if (validContacts.length > 1) {
            let bestScore = -1;
            validContacts.forEach((contact, idx) => {
              let score = 0;
              if (contact.name) score += 3;      // Name is important
              if (contact.email) score += 2;     // Email is important
              if (contact.position) score += 1;  // Position adds value
              if (score > bestScore) {
                bestScore = score;
                primaryIndex = idx;
              }
            });
          }

          for (let i = 0; i < validContacts.length; i++) {
            const contact = validContacts[i];
            // Find or create position if provided
            let positionId = null;
            if (contact.position) {
              const positionName = contact.position.trim();
              if (positionName) {
                let positionRecord = await prisma.position.findFirst({
                  where: { tenantId, name: positionName },
                });
                if (!positionRecord) {
                  positionRecord = await prisma.position.create({
                    data: { tenantId, name: positionName },
                  });
                }
                positionId = positionRecord.id;
              }
            }

            await prisma.contact.create({
              data: {
                tenantId,
                leadId: lead.id,
                name: contact.name || null,
                email: contact.email || null,
                phone: contact.phone || null,
                position: contact.position || null,
                positionId: positionId,
                linkedinUrl: contact.linkedin_url || contact.linkedinUrl || null,
                source: contact.source || null,
                isPrimary: i === primaryIndex,
              },
            });
          }
        }

        imported++;
      } catch (err) {
        logger.error('Failed to import lead', { error: err.message, leadData });
        errors.push({ index: leadData._index, error: err.message });
      }
    }

    // Update data source with final count
    await prisma.dataSource.update({
      where: { id: dataSource.id },
      data: {
        recordCount: imported,
        lastRunAt: new Date(),
        lastStatus: errors.length > 0 ? 'FAILED' : 'SUCCESS',
      },
    });

    return created(res, {
      dataSource,
      imported,
      skipped,
      failed: errors.length,
      total: leads.length,
      errors: errors.slice(0, 10), // Return first 10 errors
    });
  })
);

/**
 * Transform a record from uploaded JSON file to standard lead format
 */
function transformRecord(record, index) {
  const lead = {
    _index: index,
    companyName: record.name || record.companyName || '',
    website: record.website || '',
    location: record.location || '',
    companyType: [],
    contacts: [],
    isMarketplace: record.isMarketplace === true,
    marketplaceName: record.marketplaceName || null,
    websiteStatus: record.websiteStatus || null,
  };

  // Handle companyType - array of strings
  if (record.companyType && Array.isArray(record.companyType)) {
    lead.companyType = record.companyType.filter(t => t && t !== 'Unknown');
  }

  // Handle contacts array
  if (record.contacts && Array.isArray(record.contacts)) {
    lead.contacts = record.contacts.filter(c => c.email || c.phone);
  }

  return lead;
}

/**
 * Preview Playwright scraper - executes full Playwright scripts
 * The script should be a complete async function body that uses `page` and `browser` objects
 * and returns an array of lead objects with: companyName, website, industry, notes, city, etc.
 */
async function previewPlaywrightScraper(url, script) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // Navigate to the URL first
    logger.info(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    let results = [];

    if (script) {
      // Execute the user-provided Playwright script
      // The script has access to: page, browser, context
      // It should return an array of objects

      // Create async function from the script and execute it
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const scraperFn = new AsyncFunction('page', 'browser', 'context', 'logger', script);

      results = await scraperFn(page, browser, context, logger);

      // Pass through results exactly as the script returns them
      // Developer is responsible for returning: companyName, website, and any other fields
    } else {
      // Default extraction when no script provided
      results = await page.evaluate(() => {
        const leads = [];
        const cards = document.querySelectorAll('[class*="card"], [class*="member"], [class*="company"], [class*="listing"], .item, article');

        cards.forEach((card, index) => {
          if (index >= 100) return;

          const nameEl = card.querySelector('h2, h3, h4, [class*="name"], [class*="title"]');
          const linkEl = card.querySelector('a[href*="http"]');
          const industryEl = card.querySelector('[class*="industry"], [class*="category"], [class*="sector"]');
          const descEl = card.querySelector('[class*="description"], [class*="desc"], p');

          if (nameEl) {
            leads.push({
              companyName: nameEl.textContent?.trim(),
              website: linkEl?.href,
              industry: industryEl?.textContent?.trim(),
              notes: descEl?.textContent?.trim()?.substring(0, 500),
            });
          }
        });

        return leads;
      });
    }

    if (!Array.isArray(results)) {
      results = [];
    }

    // Remove duplicates by company name
    const seen = new Set();
    results = results.filter(item => {
      if (!item.companyName) return false;
      const key = item.companyName.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    logger.info(`Extracted ${results.length} unique leads`);
    return results;
  } finally {
    await browser.close();
  }
}

/**
 * Preview API scraper
 */
async function previewApiScraper(url, config = {}) {
  const headers = config.headers || {};

  if (config.auth?.type === 'bearer') {
    headers['Authorization'] = `Bearer ${config.auth.token}`;
  }

  const response = await fetch(url, {
    method: config.method || 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const data = await response.json();
  let items = data;

  if (config.dataPath) {
    const path = config.dataPath.split('.');
    items = path.reduce((obj, key) => obj?.[key], data);
  }

  if (!Array.isArray(items)) {
    items = [items];
  }

  return items.slice(0, 50).map(item => ({
    companyName: item.name || item.companyName || item.company_name || item.title,
    website: item.website || item.url || item.link,
    industry: item.industry || item.category || item.sector,
    notes: item.description || item.notes,
  }));
}

/**
 * Preview RSS scraper
 */
async function previewRssScraper(url) {
  const parser = new RSSParser();
  const feed = await parser.parseURL(url);

  return feed.items.slice(0, 50).map(item => ({
    companyName: item.title,
    website: item.link,
    notes: item.contentSnippet || item.content?.substring(0, 500),
  }));
}

module.exports = router;
