const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, getTenantId } = require('../middleware/tenant');
const openaiService = require('../services/openai.service');
const prisma = require('../config/database');
const { encrypt, decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

router.use(authenticate);
router.use(requireTenant);

/**
 * Helper to get API key and model from tenant settings or fall back to env
 */
async function getAiConfigForTenant(tenantId) {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    let apiKey = null;
    if (tenant?.settings?.openaiApiKey) {
      // Decrypt the stored API key
      apiKey = decrypt(tenant.settings.openaiApiKey);
    }

    const model = tenant?.settings?.openaiModel || DEFAULT_MODEL;

    return { apiKey, model };
  } catch (error) {
    logger.warn('Failed to get tenant AI config, using defaults:', error.message);
    return { apiKey: null, model: DEFAULT_MODEL };
  }
}

/**
 * @route GET /api/v1/ai/settings
 * @desc Get AI settings for tenant
 * @access Private (Admin only)
 */
// Available models
const AVAILABLE_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Recommended)', description: 'Fast and cost-effective' },
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable, higher cost' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'High capability, balanced cost' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fastest, lowest cost' },
];

const DEFAULT_MODEL = 'gpt-4o-mini';

router.get('/settings', requirePermission('settings:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const hasApiKey = !!(tenant?.settings?.openaiApiKey);
    const envConfigured = !!process.env.OPENAI_API_KEY;
    const selectedModel = tenant?.settings?.openaiModel || DEFAULT_MODEL;

    res.json({
      success: true,
      data: {
        hasApiKey,
        envConfigured,
        model: selectedModel,
        availableModels: AVAILABLE_MODELS,
        source: hasApiKey ? 'database' : (envConfigured ? 'environment' : 'none'),
      },
    });
  } catch (error) {
    logger.error('Get AI settings error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SETTINGS_ERROR', message: error.message },
    });
  }
});

/**
 * @route PUT /api/v1/ai/settings
 * @desc Update AI settings for tenant
 * @access Private (Admin only)
 */
router.put('/settings', requirePermission('settings:update'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { apiKey, model } = req.body;

    // Get current settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const currentSettings = tenant?.settings || {};

    if (apiKey) {
      // Encrypt and store the API key
      const encryptedKey = encrypt(apiKey);
      currentSettings.openaiApiKey = encryptedKey;
    } else if (apiKey === null || apiKey === '') {
      // Remove the API key
      delete currentSettings.openaiApiKey;
    }

    // Update model if provided
    if (model) {
      const validModels = AVAILABLE_MODELS.map(m => m.id);
      if (validModels.includes(model)) {
        currentSettings.openaiModel = model;
      }
    }

    // Update tenant settings
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: currentSettings },
    });

    // Re-initialize OpenAI service with new key if provided
    if (apiKey) {
      openaiService.setApiKey(apiKey);
    }

    logger.info(`AI settings updated for tenant ${tenantId}`);

    res.json({
      success: true,
      data: {
        hasApiKey: !!currentSettings.openaiApiKey,
        model: currentSettings.openaiModel || DEFAULT_MODEL,
        message: apiKey ? 'API key saved successfully' : 'Settings updated',
      },
    });
  } catch (error) {
    logger.error('Update AI settings error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SETTINGS_ERROR', message: error.message },
    });
  }
});

/**
 * @route POST /api/v1/ai/test
 * @desc Test AI connection with current or provided API key
 * @access Private (Admin only)
 */
router.post('/test', requirePermission('settings:read'), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const { apiKey: testKey } = req.body;

    // Get tenant config
    const tenantConfig = await getAiConfigForTenant(tenantId);

    // Use provided key or get from tenant/env
    let apiKey = testKey || tenantConfig.apiKey || process.env.OPENAI_API_KEY;
    const model = tenantConfig.model;

    if (!apiKey) {
      return res.json({
        success: true,
        data: {
          working: false,
          error: 'No API key configured',
        },
      });
    }

    // Test with the key and model
    const testResult = await openaiService.testWithKey(apiKey, model);

    res.json({
      success: true,
      data: testResult,
    });
  } catch (error) {
    logger.error('AI test error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'TEST_FAILED', message: error.message },
    });
  }
});

/**
 * @route POST /api/v1/ai/generate-variations
 * @desc Generate template variations using AI
 * @access Private
 */
router.post('/generate-variations', async (req, res) => {
  try {
    const { prompt, channelType, count = 10 } = req.body;
    const tenantId = getTenantId(req);

    // Validation
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROMPT',
          message: 'Prompt must be at least 10 characters long',
        },
      });
    }

    if (!channelType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CHANNEL_TYPE',
          message: 'Channel type is required',
        },
      });
    }

    const validChannelTypes = ['EMAIL_SMTP', 'EMAIL_API', 'WHATSAPP_WEB', 'WHATSAPP_BUSINESS', 'TELEGRAM', 'SMS'];
    if (!validChannelTypes.includes(channelType)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CHANNEL_TYPE',
          message: `Channel type must be one of: ${validChannelTypes.join(', ')}`,
        },
      });
    }

    // Get AI config for tenant
    const tenantConfig = await getAiConfigForTenant(tenantId);
    const apiKey = tenantConfig.apiKey || process.env.OPENAI_API_KEY;
    const model = tenantConfig.model;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_API_KEY',
          message: 'OpenAI API key not configured. Please configure it in Settings.',
        },
      });
    }

    const variationCount = Math.min(Math.max(parseInt(count, 10) || 10, 1), 50);

    logger.info(`User ${req.user.id} requesting ${variationCount} ${channelType} variations with model ${model}`);

    const variations = await openaiService.generateTemplateVariationsWithKey({
      prompt: prompt.trim(),
      channelType,
      count: variationCount,
      apiKey,
      model,
    });

    res.json({
      success: true,
      data: {
        variations,
        count: variations.length,
      },
    });
  } catch (error) {
    logger.error('Generate variations error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GENERATION_FAILED',
        message: error.message || 'Failed to generate variations',
      },
    });
  }
});

/**
 * @route GET /api/v1/ai/status
 * @desc Check if AI service is configured
 * @access Private
 */
router.get('/status', async (req, res) => {
  try {
    const tenantId = getTenantId(req);

    // Get AI config for tenant
    const tenantConfig = await getAiConfigForTenant(tenantId);
    const apiKey = tenantConfig.apiKey || process.env.OPENAI_API_KEY;
    const source = tenantConfig.apiKey ? 'database' : (process.env.OPENAI_API_KEY ? 'environment' : 'none');

    if (!apiKey) {
      return res.json({
        success: true,
        data: {
          configured: false,
          message: 'OpenAI API key not configured',
        },
      });
    }

    res.json({
      success: true,
      data: {
        configured: true,
        source,
        model: tenantConfig.model,
      },
    });
  } catch (error) {
    logger.error('AI status check error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_CHECK_FAILED',
        message: error.message,
      },
    });
  }
});

module.exports = router;
