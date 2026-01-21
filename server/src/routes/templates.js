const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, addTenantFilter, getTenantId } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { success, paginated, noContent, created } = require('../utils/response');

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   GET /api/v1/templates
 * @desc    List templates
 * @access  Private
 */
router.get(
  '/',
  requirePermission('templates:read'),
  [
    query('channelType').optional().isIn([
      'EMAIL_SMTP', 'EMAIL_API', 'SMS', 'WHATSAPP_WEB',
      'WHATSAPP_BUSINESS', 'TELEGRAM', 'VOICE'
    ]),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    const where = addTenantFilter(req, {});
    if (req.query.channelType) where.channelType = req.query.channelType;

    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where,
        select: {
          id: true,
          name: true,
          channelType: true,
          subject: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.template.count({ where }),
    ]);

    return paginated(res, templates, page, limit, total);
  })
);

/**
 * @route   POST /api/v1/templates
 * @desc    Create template
 * @access  Private
 */
router.post(
  '/',
  requirePermission('templates:create'),
  [
    body('name').trim().isLength({ min: 1, max: 255 }),
    body('channelType').isIn([
      'EMAIL_SMTP', 'EMAIL_API', 'SMS', 'WHATSAPP_WEB',
      'WHATSAPP_BUSINESS', 'TELEGRAM', 'VOICE'
    ]),
    body('subject').optional({ nullable: true }),
    body('body').notEmpty(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name, channelType, subject, body: templateBody, attachments } = req.body;

    const template = await prisma.template.create({
      data: {
        tenantId: getTenantId(req),
        name,
        channelType,
        subject,
        body: templateBody,
        attachments,
        createdById: req.user.id,
      },
    });

    return created(res, template);
  })
);

/**
 * @route   GET /api/v1/templates/:id
 * @desc    Get template
 * @access  Private
 */
router.get(
  '/:id',
  requirePermission('templates:read'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const template = await prisma.template.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!template) throw AppError.notFound('Template not found');

    return success(res, template);
  })
);

/**
 * @route   PATCH /api/v1/templates/:id
 * @desc    Update template
 * @access  Private
 */
router.patch(
  '/:id',
  requirePermission('templates:update'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const { name, subject, body: templateBody, attachments } = req.body;

    const existing = await prisma.template.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) throw AppError.notFound('Template not found');

    const template = await prisma.template.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(subject !== undefined && { subject }),
        ...(templateBody && { body: templateBody }),
        ...(attachments !== undefined && { attachments }),
      },
    });

    return success(res, template);
  })
);

/**
 * @route   DELETE /api/v1/templates/:id
 * @desc    Delete template
 * @access  Private
 */
router.delete(
  '/:id',
  requirePermission('templates:delete'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const existing = await prisma.template.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) throw AppError.notFound('Template not found');

    await prisma.template.delete({ where: { id: req.params.id } });

    return noContent(res);
  })
);

/**
 * @route   POST /api/v1/templates/:id/preview
 * @desc    Preview template with data
 * @access  Private
 */
router.post(
  '/:id/preview',
  requirePermission('templates:read'),
  [
    param('id').isInt().toInt(),
    body('leadId').optional().isInt(),
    body('contactId').optional().isInt(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { leadId, contactId } = req.body;

    const template = await prisma.template.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!template) throw AppError.notFound('Template not found');

    let lead = null;
    let contact = null;

    if (leadId) {
      lead = await prisma.lead.findFirst({
        where: addTenantFilter(req, { id: leadId }),
      });
    }

    if (contactId) {
      contact = await prisma.contact.findFirst({
        where: addTenantFilter(req, { id: contactId }),
      });
    }

    // Simple variable replacement
    let renderedBody = template.body;
    let renderedSubject = template.subject || '';

    const variables = {
      'lead.company_name': lead?.companyName || '[Company Name]',
      'lead.website': lead?.website || '[Website]',
      'lead.industry': lead?.industry || '[Industry]',
      'contact.name': contact?.name || '[Contact Name]',
      'contact.email': contact?.email || '[Email]',
      'contact.phone': contact?.phone || '[Phone]',
      'contact.position': contact?.position || '[Position]',
      'unsubscribe_link': '#unsubscribe',
      'current_date': new Date().toLocaleDateString(),
    };

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      renderedBody = renderedBody.replace(regex, value);
      renderedSubject = renderedSubject.replace(regex, value);
    });

    return success(res, {
      subject: renderedSubject,
      body: renderedBody,
      variables: Object.keys(variables),
    });
  })
);

module.exports = router;
