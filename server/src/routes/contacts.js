const express = require('express');
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/rbac');
const { requireTenant, addTenantFilter, getTenantId } = require('../middleware/tenant');
const { asyncHandler } = require('../middleware/errorHandler');
const prisma = require('../config/database');
const AppError = require('../utils/AppError');
const { success, noContent, created } = require('../utils/response');

const router = express.Router();

router.use(authenticate);
router.use(requireTenant);

/**
 * @route   POST /api/v1/contacts
 * @desc    Create a new contact
 * @access  Private
 */
router.post(
  '/',
  requirePermission('contacts:create'),
  [
    body('leadId').isInt().withMessage('Lead ID is required'),
    body('name').optional({ values: 'falsy' }).trim(),
    body('email').optional({ values: 'falsy' }).isEmail(),
    body('phone').optional({ values: 'falsy' }),
    body('position').optional({ values: 'falsy' }),
    body('isPrimary').optional().isBoolean(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { leadId, name, email, phone, position, isPrimary } = req.body;
    const tenantId = getTenantId(req);

    // Verify lead exists and belongs to tenant
    const lead = await prisma.lead.findFirst({
      where: addTenantFilter(req, { id: leadId, isDeleted: false }),
    });

    if (!lead) {
      throw AppError.notFound('Lead not found');
    }

    // If setting as primary, unset other primaries
    if (isPrimary) {
      await prisma.contact.updateMany({
        where: { leadId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.contact.create({
      data: {
        tenantId,
        leadId,
        name,
        email,
        phone,
        position,
        isPrimary: isPrimary || false,
      },
    });

    return created(res, contact);
  })
);

/**
 * @route   GET /api/v1/contacts/:id
 * @desc    Get contact by ID
 * @access  Private
 */
router.get(
  '/:id',
  requirePermission('contacts:read'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const contact = await prisma.contact.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
      include: {
        lead: {
          select: { id: true, companyName: true },
        },
      },
    });

    if (!contact) {
      throw AppError.notFound('Contact not found');
    }

    return success(res, contact);
  })
);

/**
 * @route   PATCH /api/v1/contacts/:id
 * @desc    Update contact
 * @access  Private
 */
router.patch(
  '/:id',
  requirePermission('contacts:update'),
  [
    param('id').isInt().toInt(),
    body('name').optional({ values: 'falsy' }).trim(),
    body('email').optional({ values: 'falsy' }).isEmail(),
    body('phone').optional({ values: 'falsy' }),
    body('position').optional({ values: 'falsy' }),
    body('isPrimary').optional().isBoolean(),
    validate,
  ],
  asyncHandler(async (req, res) => {
    const { name, email, phone, position, isPrimary } = req.body;

    const existing = await prisma.contact.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) {
      throw AppError.notFound('Contact not found');
    }

    // If setting as primary, unset other primaries
    if (isPrimary) {
      await prisma.contact.updateMany({
        where: { leadId: existing.leadId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.contact.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(position !== undefined && { position }),
        ...(isPrimary !== undefined && { isPrimary }),
      },
    });

    return success(res, contact);
  })
);

/**
 * @route   DELETE /api/v1/contacts/:id
 * @desc    Delete contact
 * @access  Private
 */
router.delete(
  '/:id',
  requirePermission('contacts:delete'),
  [param('id').isInt().toInt(), validate],
  asyncHandler(async (req, res) => {
    const existing = await prisma.contact.findFirst({
      where: addTenantFilter(req, { id: req.params.id }),
    });

    if (!existing) {
      throw AppError.notFound('Contact not found');
    }

    await prisma.contact.delete({
      where: { id: req.params.id },
    });

    return noContent(res);
  })
);

module.exports = router;
