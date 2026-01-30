const prisma = require('../config/database');
const whatsappWebService = require('./whatsappWeb.service');
const logger = require('../utils/logger');

class WhatsAppProspectsService {
  /**
   * Import prospects from a WhatsApp group
   * @param {number} tenantId - Tenant ID
   * @param {number} channelConfigId - Channel config ID
   * @param {string} whatsappGroupId - WhatsApp group ID
   * @param {string} whatsappGroupName - Original WhatsApp group name
   * @param {Array} contacts - Array of contacts to import
   * @param {string} customName - User-provided custom name for the group
   * @param {number} createdById - User ID who created this
   * @returns {Object} Import result
   */
  async importProspects(tenantId, channelConfigId, whatsappGroupId, whatsappGroupName, contacts, customName, createdById) {
    // Check if group already exists
    const existingGroup = await prisma.whatsAppProspectGroup.findUnique({
      where: {
        tenantId_channelConfigId_whatsappGroupId: {
          tenantId,
          channelConfigId,
          whatsappGroupId,
        },
      },
    });

    if (existingGroup) {
      throw new Error(`Prospects from this WhatsApp group have already been imported as "${existingGroup.name}"`);
    }

    // Create the prospect group
    const group = await prisma.whatsAppProspectGroup.create({
      data: {
        tenantId,
        channelConfigId,
        name: customName,
        whatsappGroupId,
        whatsappGroupName,
        prospectCount: contacts.length,
        createdById,
      },
    });

    // Create prospects in bulk
    let importedCount = 0;
    for (const contact of contacts) {
      try {
        // Ensure whatsappUserId is a string (should be like "919876543210@c.us")
        let whatsappUserId = '';
        if (typeof contact.id === 'string') {
          whatsappUserId = contact.id;
        } else if (contact.id && contact.id._serialized) {
          whatsappUserId = contact.id._serialized;
        } else if (contact.id) {
          whatsappUserId = String(contact.id);
        }

        // Ensure phone is a string with only digits
        let phone = '';
        if (contact.phone) {
          phone = String(contact.phone).replace(/[^\d]/g, '');
        }

        // If phone is empty but we have whatsappUserId, extract from it
        if (!phone && whatsappUserId.includes('@')) {
          const parts = whatsappUserId.split('@');
          if (parts[0] && /^\d+$/.test(parts[0])) {
            phone = parts[0];
          }
        }

        logger.info(`Importing WhatsApp prospect: id=${whatsappUserId}, phone=${phone}, name=${contact.name}`);

        await prisma.whatsAppProspect.create({
          data: {
            tenantId,
            groupId: group.id,
            whatsappUserId: whatsappUserId,
            name: contact.name || null,
            phone: phone || null,
            isAdmin: contact.isAdmin || false,
            status: 'PENDING',
          },
        });
        importedCount++;
      } catch (error) {
        // Skip duplicates or errors
        logger.warn(`Failed to import prospect ${contact.id}: ${error.message}`);
      }
    }

    // Update group prospect count
    await prisma.whatsAppProspectGroup.update({
      where: { id: group.id },
      data: { prospectCount: importedCount },
    });

    logger.info(`Imported ${importedCount} WhatsApp prospects into group "${customName}" for tenant ${tenantId}`);

    return {
      group: {
        id: group.id,
        name: group.name,
        whatsappGroupName: group.whatsappGroupName,
      },
      importedCount,
      totalContacts: contacts.length,
    };
  }

  /**
   * Get all prospect groups for a tenant
   * @param {number} tenantId - Tenant ID
   * @param {number} channelConfigId - Optional channel config ID filter
   * @returns {Array} List of groups
   */
  async getGroups(tenantId, channelConfigId = null) {
    const where = { tenantId };
    if (channelConfigId) {
      where.channelConfigId = channelConfigId;
    }

    const groups = await prisma.whatsAppProspectGroup.findMany({
      where,
      include: {
        channelConfig: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            prospects: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add status counts
    const groupsWithStats = await Promise.all(
      groups.map(async (group) => {
        const statusCounts = await prisma.whatsAppProspect.groupBy({
          by: ['status'],
          where: { groupId: group.id },
          _count: true,
        });

        const stats = {
          pending: 0,
          messaged: 0,
          replied: 0,
          converted: 0,
        };

        statusCounts.forEach((item) => {
          stats[item.status.toLowerCase()] = item._count;
        });

        return {
          ...group,
          stats,
        };
      })
    );

    return groupsWithStats;
  }

  /**
   * Get a single prospect group with details
   * @param {number} groupId - Group ID
   * @param {number} tenantId - Tenant ID
   * @returns {Object} Group with prospects
   */
  async getGroup(groupId, tenantId) {
    const group = await prisma.whatsAppProspectGroup.findFirst({
      where: { id: groupId, tenantId },
      include: {
        channelConfig: {
          select: {
            id: true,
            name: true,
            credentials: true,
          },
        },
      },
    });

    if (!group) {
      throw new Error('Prospect group not found');
    }

    return group;
  }

  /**
   * Get prospects in a group with pagination
   * @param {number} groupId - Group ID
   * @param {number} tenantId - Tenant ID
   * @param {Object} options - Pagination and filter options
   * @returns {Object} Paginated prospects
   */
  async getProspects(groupId, tenantId, options = {}) {
    const { page = 1, limit = 50, status = null, search = null } = options;

    const where = { groupId, tenantId };
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [prospects, total] = await Promise.all([
      prisma.whatsAppProspect.findMany({
        where,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          convertedLead: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.whatsAppProspect.count({ where }),
    ]);

    return {
      prospects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update prospect status to MESSAGED and record the message
   * @param {number} prospectId - Prospect ID
   * @param {string} content - Message content
   * @param {number} campaignId - Optional campaign ID
   * @param {string} whatsappMsgId - WhatsApp message ID
   * @returns {Object} Updated prospect
   */
  async markAsMessaged(prospectId, content, campaignId = null, whatsappMsgId = null) {
    const now = new Date();

    await prisma.$transaction([
      prisma.whatsAppProspect.update({
        where: { id: prospectId },
        data: {
          status: 'MESSAGED',
          lastMessagedAt: now,
        },
      }),
      prisma.whatsAppProspectMessage.create({
        data: {
          prospectId,
          direction: 'OUTBOUND',
          content,
          campaignId,
          whatsappMsgId,
          sentAt: now,
        },
      }),
    ]);

    return { updated: true };
  }

  /**
   * Record an inbound reply and update prospect status
   * @param {number} prospectId - Prospect ID
   * @param {string} content - Reply content
   * @param {string} whatsappMsgId - WhatsApp message ID
   * @returns {Object} Updated prospect
   */
  async recordReply(prospectId, content, whatsappMsgId = null) {
    const now = new Date();

    await prisma.$transaction([
      prisma.whatsAppProspect.update({
        where: { id: prospectId },
        data: {
          status: 'REPLIED',
          lastRepliedAt: now,
        },
      }),
      prisma.whatsAppProspectMessage.create({
        data: {
          prospectId,
          direction: 'INBOUND',
          content,
          whatsappMsgId,
        },
      }),
    ]);

    return { updated: true };
  }

  /**
   * Convert a prospect to a lead
   * @param {number} prospectId - Prospect ID
   * @param {number} tenantId - Tenant ID
   * @param {number} createdById - User ID
   * @returns {Object} Created lead
   */
  async convertToLead(prospectId, tenantId, createdById) {
    const prospect = await prisma.whatsAppProspect.findFirst({
      where: { id: prospectId, tenantId },
      include: {
        group: true,
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!prospect) {
      throw new Error('Prospect not found');
    }

    if (prospect.status === 'CONVERTED') {
      throw new Error('Prospect has already been converted to a lead');
    }

    const contactName = prospect.name || prospect.phone || 'Unknown';

    // Check if a lead with same whatsappUserId already exists (duplicate check)
    const existingLead = await prisma.lead.findFirst({
      where: {
        tenantId,
        isDeleted: false,
        customFields: {
          path: '$.whatsappUserId',
          equals: prospect.whatsappUserId,
        },
      },
    });

    if (existingLead) {
      // Link prospect to existing lead instead of creating duplicate
      await prisma.whatsAppProspect.update({
        where: { id: prospectId },
        data: {
          status: 'CONVERTED',
          convertedLeadId: existingLead.id,
        },
      });

      logger.info(`WhatsApp prospect ${prospectId} linked to existing lead ${existingLead.id} (same whatsappUserId: ${prospect.whatsappUserId})`);
      return existingLead;
    }

    // Create lead and contact in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find or create a DataSource for this prospect group
      let dataSource = await tx.dataSource.findFirst({
        where: {
          tenantId,
          type: 'MANUAL', // Using MANUAL as there's no WHATSAPP type yet
          name: prospect.group.name,
        },
      });

      if (!dataSource) {
        dataSource = await tx.dataSource.create({
          data: {
            tenantId,
            name: prospect.group.name,
            type: 'MANUAL',
            isActive: true,
            config: {
              source: 'whatsapp_prospect',
              prospectGroupId: prospect.groupId,
              whatsappGroupId: prospect.group.whatsappGroupId,
              whatsappGroupName: prospect.group.whatsappGroupName,
            },
            createdById,
          },
        });
        logger.info(`Created DataSource "${prospect.group.name}" for WhatsApp prospects`);
      }

      // Create lead with sourceId
      const lead = await tx.lead.create({
        data: {
          tenantId,
          companyName: contactName,
          status: 'NEW',
          sourceId: dataSource.id,
          customFields: {
            whatsappUserId: prospect.whatsappUserId,
            whatsappPhone: prospect.phone,
            importSource: 'whatsapp_prospect',
            prospectGroupId: prospect.groupId,
            prospectGroupName: prospect.group.name,
          },
          createdById,
        },
      });

      // Create contact
      await tx.contact.create({
        data: {
          tenantId,
          leadId: lead.id,
          name: contactName,
          phone: prospect.phone || null,
          source: 'whatsapp',
          isPrimary: true,
        },
      });

      // Update prospect
      await tx.whatsAppProspect.update({
        where: { id: prospectId },
        data: {
          status: 'CONVERTED',
          convertedLeadId: lead.id,
        },
      });

      return lead;
    });

    logger.info(`Converted WhatsApp prospect ${prospectId} to lead ${result.id}`);

    return result;
  }

  /**
   * Poll for replies from messaged prospects
   * @param {number} channelConfigId - Channel config ID
   * @param {number} tenantId - Tenant ID
   * @param {boolean} autoConvert - Whether to auto-convert on reply
   * @param {number} createdById - User ID for lead creation (optional)
   * @returns {Object} Poll results
   */
  async pollReplies(channelConfigId, tenantId, autoConvert = false, createdById = null) {
    logger.info(`Starting WhatsApp reply poll for channel ${channelConfigId}, tenant ${tenantId}, autoConvert: ${autoConvert}`);

    // Get all prospect groups for this channel
    const groups = await prisma.whatsAppProspectGroup.findMany({
      where: {
        channelConfigId,
        tenantId,
      },
      select: { id: true, name: true },
    });

    logger.info(`Checking ${groups.length} groups: ${groups.map(g => g.name).join(', ')}`);

    // Get all MESSAGED prospects from these groups
    const messagedProspects = await prisma.whatsAppProspect.findMany({
      where: {
        groupId: { in: groups.map(g => g.id) },
        status: 'MESSAGED',
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    logger.info(`Found ${messagedProspects.length} MESSAGED prospects to check for replies`);

    if (messagedProspects.length === 0) {
      return {
        success: true,
        repliesFound: 0,
        results: [],
        prospectsChecked: 0,
      };
    }

    let repliesFound = 0;
    const results = [];

    // Check each prospect for new messages
    for (const prospect of messagedProspects) {
      try {
        // Build chat ID - MUST use phone-based @c.us format, NOT LID
        // LID format doesn't work for fetching chat messages
        let chatId = '';

        // Priority 1: Use phone field to build @c.us chat ID
        if (prospect.phone) {
          const cleanPhone = String(prospect.phone).replace(/[^\d]/g, '');
          if (/^\d{7,15}$/.test(cleanPhone)) {
            chatId = `${cleanPhone}@c.us`;
          }
        }

        // Priority 2: Use whatsappUserId only if it's already @c.us format (not LID)
        if (!chatId && prospect.whatsappUserId) {
          if (prospect.whatsappUserId.includes('@c.us')) {
            chatId = prospect.whatsappUserId;
          } else if (!prospect.whatsappUserId.includes('@lid')) {
            // Extract phone from non-LID format
            const parts = prospect.whatsappUserId.split('@');
            if (parts[0] && /^\d{7,15}$/.test(parts[0])) {
              chatId = `${parts[0]}@c.us`;
            }
          }
        }

        if (!chatId) {
          logger.warn(`Prospect ${prospect.id} has no valid phone for chat lookup, skipping (whatsappUserId: ${prospect.whatsappUserId}, phone: ${prospect.phone})`);
          continue;
        }

        logger.info(`Checking replies for prospect ${prospect.id} (${prospect.name || 'Unknown'}), chatId: ${chatId}`);

        // Get the timestamp of the last message we sent/received
        const lastMessageTime = prospect.lastMessagedAt || prospect.updatedAt || prospect.createdAt;
        const sinceTimestamp = new Date(lastMessageTime).getTime();

        logger.info(`Looking for messages since ${new Date(sinceTimestamp).toISOString()}`);

        // Fetch new incoming messages
        const newMessages = await whatsappWebService.getNewIncomingMessages(
          tenantId,
          channelConfigId,
          chatId,
          sinceTimestamp
        );

        logger.info(`Found ${newMessages.length} new messages for prospect ${prospect.id}`);

        if (newMessages.length > 0) {
          repliesFound++;
          logger.info(`Found ${newMessages.length} new replies from prospect ${prospect.id} (${prospect.name || prospect.phone})`);

          // Record the reply and update status
          const latestReply = newMessages[0];

          await this.recordReply(prospect.id, latestReply.content, latestReply.id);

          results.push({
            prospectId: prospect.id,
            prospectName: prospect.name || prospect.phone,
            repliesCount: newMessages.length,
            latestReply: latestReply.content,
          });

          // Auto-convert to lead if enabled
          if (autoConvert && prospect.status !== 'CONVERTED') {
            try {
              const lead = await this.convertToLead(prospect.id, tenantId, createdById || 1);
              logger.info(`Auto-converted WhatsApp prospect ${prospect.id} to lead ${lead.id}`);
              results[results.length - 1].convertedToLeadId = lead.id;
            } catch (convertError) {
              logger.error(`Failed to auto-convert prospect ${prospect.id}: ${convertError.message}`);
            }
          }
        }
      } catch (error) {
        logger.error(`Error checking replies for prospect ${prospect.id}: ${error.message}`);
      }
    }

    logger.info(`WhatsApp reply poll complete for channel ${channelConfigId}: ${repliesFound} replies found out of ${messagedProspects.length} prospects checked`);

    return {
      success: true,
      repliesFound,
      results,
      prospectsChecked: messagedProspects.length,
    };
  }

  /**
   * Delete a prospect group and all its prospects
   * @param {number} groupId - Group ID
   * @param {number} tenantId - Tenant ID
   */
  async deleteGroup(groupId, tenantId) {
    const group = await prisma.whatsAppProspectGroup.findFirst({
      where: { id: groupId, tenantId },
    });

    if (!group) {
      throw new Error('Prospect group not found');
    }

    // Delete will cascade to prospects and messages
    await prisma.whatsAppProspectGroup.delete({
      where: { id: groupId },
    });

    logger.info(`Deleted WhatsApp prospect group ${groupId} (${group.name}) for tenant ${tenantId}`);

    return { deleted: true };
  }

  /**
   * Get messages for a specific prospect
   * @param {number} prospectId - Prospect ID
   * @param {number} tenantId - Tenant ID
   * @returns {Array} Messages
   */
  async getProspectMessages(prospectId, tenantId) {
    const prospect = await prisma.whatsAppProspect.findFirst({
      where: { id: prospectId, tenantId },
    });

    if (!prospect) {
      throw new Error('Prospect not found');
    }

    const messages = await prisma.whatsAppProspectMessage.findMany({
      where: { prospectId },
      orderBy: { createdAt: 'asc' },
    });

    return messages;
  }
}

module.exports = new WhatsAppProspectsService();
