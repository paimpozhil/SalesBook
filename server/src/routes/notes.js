const express = require('express');
const { body, param } = require('express-validator');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const { getTenantId } = require('../middleware/tenant');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Get notes for a lead
router.get(
  '/lead/:leadId',
  [param('leadId').isInt().withMessage('Invalid lead ID')],
  validate,
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const leadId = parseInt(req.params.leadId);

    // Verify lead belongs to tenant
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        ...(tenantId && { tenantId }),
        isDeleted: false,
      },
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lead not found' },
      });
    }

    const notes = await prisma.note.findMany({
      where: { leadId },
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: notes,
    });
  })
);

// Create a note
router.post(
  '/',
  [
    body('leadId').isInt().withMessage('Lead ID is required'),
    body('content').notEmpty().withMessage('Content is required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req, true);
    const { leadId, content } = req.body;

    // Verify lead belongs to tenant
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        ...(tenantId && { tenantId }),
        isDeleted: false,
      },
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lead not found' },
      });
    }

    const note = await prisma.note.create({
      data: {
        tenantId: lead.tenantId,
        leadId,
        content,
        createdById: req.user.id,
      },
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: note,
    });
  })
);

// Update a note
router.patch(
  '/:id',
  [
    param('id').isInt().withMessage('Invalid note ID'),
    body('content').notEmpty().withMessage('Content is required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const noteId = parseInt(req.params.id);
    const { content } = req.body;

    // Find the note
    const existingNote = await prisma.note.findFirst({
      where: {
        id: noteId,
        ...(tenantId && { tenantId }),
      },
    });

    if (!existingNote) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Note not found' },
      });
    }

    const note = await prisma.note.update({
      where: { id: noteId },
      data: { content },
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    res.json({
      success: true,
      data: note,
    });
  })
);

// Delete a note
router.delete(
  '/:id',
  [param('id').isInt().withMessage('Invalid note ID')],
  validate,
  asyncHandler(async (req, res) => {
    const tenantId = getTenantId(req);
    const noteId = parseInt(req.params.id);

    // Find the note
    const existingNote = await prisma.note.findFirst({
      where: {
        id: noteId,
        ...(tenantId && { tenantId }),
      },
    });

    if (!existingNote) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Note not found' },
      });
    }

    await prisma.note.delete({
      where: { id: noteId },
    });

    res.json({
      success: true,
      message: 'Note deleted successfully',
    });
  })
);

module.exports = router;
