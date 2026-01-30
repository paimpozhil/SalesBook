const prisma = require('../config/database');
const telegramService = require('./telegram.service');
const logger = require('../utils/logger');

class TelegramProspectsService {
  /**
   * Import prospects from a Telegram group
   * @param {number} tenantId - Tenant ID
   * @param {number} channelConfigId - Channel config ID
   * @param {string} sessionKey - Telegram session key
   * @param {string} telegramGroupId - Telegram group ID
   * @param {string} telegramGroupName - Original Telegram group name
   * @param {Array} contacts - Array of contacts to import
   * @param {string} customName - User-provided custom name for the group
   * @param {number} createdById - User ID who created this
   * @returns {Object} Import result
   */
  async importProspects(tenantId, channelConfigId, sessionKey, telegramGroupId, telegramGroupName, contacts, customName, createdById) {
    // Check if group already exists
    const existingGroup = await prisma.telegramProspectGroup.findUnique({
      where: {
        tenantId_channelConfigId_telegramGroupId: {
          tenantId,
          channelConfigId,
          telegramGroupId,
        },
      },
    });

    if (existingGroup) {
      throw new Error(`Prospects from this Telegram group have already been imported as "${existingGroup.name}"`);
    }

    // Create the prospect group
    const group = await prisma.telegramProspectGroup.create({
      data: {
        tenantId,
        channelConfigId,
        name: customName,
        telegramGroupId,
        telegramGroupName,
        prospectCount: contacts.length,
        createdById,
      },
    });

    // Create prospects in bulk
    let importedCount = 0;
    for (const contact of contacts) {
      try {
        await prisma.telegramProspect.create({
          data: {
            tenantId,
            groupId: group.id,
            telegramUserId: contact.id.toString(),
            firstName: contact.firstName || null,
            lastName: contact.lastName || null,
            username: contact.username || null,
            phone: contact.phone || null,
            accessHash: contact.accessHash || null,
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
    await prisma.telegramProspectGroup.update({
      where: { id: group.id },
      data: { prospectCount: importedCount },
    });

    logger.info(`Imported ${importedCount} prospects into group "${customName}" for tenant ${tenantId}`);

    return {
      group: {
        id: group.id,
        name: group.name,
        telegramGroupName: group.telegramGroupName,
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

    const groups = await prisma.telegramProspectGroup.findMany({
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
        const statusCounts = await prisma.telegramProspect.groupBy({
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
    const group = await prisma.telegramProspectGroup.findFirst({
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
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { username: { contains: search } },
      ];
    }

    const [prospects, total] = await Promise.all([
      prisma.telegramProspect.findMany({
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
      prisma.telegramProspect.count({ where }),
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
   * @param {string} telegramMsgId - Telegram message ID
   * @returns {Object} Updated prospect
   */
  async markAsMessaged(prospectId, content, campaignId = null, telegramMsgId = null) {
    const now = new Date();

    await prisma.$transaction([
      prisma.telegramProspect.update({
        where: { id: prospectId },
        data: {
          status: 'MESSAGED',
          lastMessagedAt: now,
        },
      }),
      prisma.telegramProspectMessage.create({
        data: {
          prospectId,
          direction: 'OUTBOUND',
          content,
          campaignId,
          telegramMsgId,
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
   * @param {string} telegramMsgId - Telegram message ID
   * @returns {Object} Updated prospect
   */
  async recordReply(prospectId, content, telegramMsgId = null) {
    const now = new Date();

    await prisma.$transaction([
      prisma.telegramProspect.update({
        where: { id: prospectId },
        data: {
          status: 'REPLIED',
          lastRepliedAt: now,
        },
      }),
      prisma.telegramProspectMessage.create({
        data: {
          prospectId,
          direction: 'INBOUND',
          content,
          telegramMsgId,
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
    const prospect = await prisma.telegramProspect.findFirst({
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

    const contactName = [prospect.firstName, prospect.lastName].filter(Boolean).join(' ') || prospect.username || 'Unknown';

    // Check if a lead with same telegramUserId already exists (duplicate check)
    const existingLead = await prisma.lead.findFirst({
      where: {
        tenantId,
        isDeleted: false,
        customFields: {
          path: ['telegramUserId'],
          equals: prospect.telegramUserId,
        },
      },
    });

    if (existingLead) {
      // Link prospect to existing lead instead of creating duplicate
      await prisma.telegramProspect.update({
        where: { id: prospectId },
        data: {
          status: 'CONVERTED',
          convertedLeadId: existingLead.id,
        },
      });

      logger.info(`Prospect ${prospectId} linked to existing lead ${existingLead.id} (same telegramUserId: ${prospect.telegramUserId})`);
      return existingLead;
    }

    // Create lead and contact in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find or create a DataSource for this prospect group
      let dataSource = await tx.dataSource.findFirst({
        where: {
          tenantId,
          type: 'TELEGRAM',
          name: prospect.group.name,
        },
      });

      if (!dataSource) {
        dataSource = await tx.dataSource.create({
          data: {
            tenantId,
            name: prospect.group.name,
            type: 'TELEGRAM',
            isActive: true,
            config: {
              prospectGroupId: prospect.groupId,
              telegramGroupId: prospect.group.telegramGroupId,
              telegramGroupName: prospect.group.telegramGroupName,
            },
            createdById,
          },
        });
        logger.info(`Created DataSource "${prospect.group.name}" for Telegram prospects`);
      }

      // Create lead with sourceId
      const lead = await tx.lead.create({
        data: {
          tenantId,
          companyName: contactName,
          status: 'NEW',
          sourceId: dataSource.id,
          customFields: {
            telegramUserId: prospect.telegramUserId,
            telegramUsername: prospect.username,
            importSource: 'telegram_prospect',
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
          source: 'telegram',
          isPrimary: true,
        },
      });

      // Update prospect
      await tx.telegramProspect.update({
        where: { id: prospectId },
        data: {
          status: 'CONVERTED',
          convertedLeadId: lead.id,
        },
      });

      return lead;
    });

    logger.info(`Converted prospect ${prospectId} to lead ${result.id}`);

    return result;
  }

  /**
   * Poll for replies from messaged prospects
   * @param {number} channelConfigId - Channel config ID
   * @param {Object} credentials - Telegram credentials (apiId, apiHash)
   * @param {number} tenantId - Tenant ID
   * @param {boolean} autoConvert - Whether to auto-convert on reply
   * @returns {Object} Poll results
   */
  async pollReplies(channelConfigId, credentials, tenantId, autoConvert = false) {
    const { apiId, apiHash } = credentials;
    const sessionKey = telegramService.getSessionKey(tenantId, apiId);

    logger.info(`Starting reply poll for channel ${channelConfigId}, tenant ${tenantId}, autoConvert: ${autoConvert}`);

    // Try to reconnect if not connected
    let client = telegramService.getClient(sessionKey);
    if (!client) {
      logger.info(`Telegram client not in memory, attempting reconnect for ${sessionKey}`);
      try {
        await telegramService.reconnect(tenantId, apiId, apiHash);
        client = telegramService.getClient(sessionKey);
        logger.info(`Telegram reconnected successfully for ${sessionKey}`);
      } catch (error) {
        logger.error(`Failed to reconnect Telegram for polling: ${error.message}`);
        return { error: 'Failed to connect to Telegram', repliesFound: 0, prospectsChecked: 0 };
      }
    }

    // Get all MESSAGED prospects for this channel
    const groups = await prisma.telegramProspectGroup.findMany({
      where: { channelConfigId, tenantId },
      select: { id: true, name: true },
    });

    if (groups.length === 0) {
      logger.info(`No prospect groups found for channel ${channelConfigId}`);
      return { repliesFound: 0, prospectsChecked: 0, results: [] };
    }

    const groupIds = groups.map((g) => g.id);
    logger.info(`Checking ${groups.length} groups: ${groups.map(g => g.name).join(', ')}`);

    const messagedProspects = await prisma.telegramProspect.findMany({
      where: {
        groupId: { in: groupIds },
        status: 'MESSAGED',
      },
      include: {
        messages: {
          where: { direction: 'OUTBOUND' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    logger.info(`Found ${messagedProspects.length} MESSAGED prospects to check for replies`);

    let repliesFound = 0;
    const results = [];
    const errors = [];

    for (const prospect of messagedProspects) {
      try {
        const prospectName = [prospect.firstName, prospect.lastName].filter(Boolean).join(' ') || prospect.username || prospect.telegramUserId;
        logger.info(`Checking replies from prospect ${prospect.id} (${prospectName}), telegramUserId: ${prospect.telegramUserId}`);

        // Get the last outbound message ID to check for newer messages
        const lastOutbound = prospect.messages[0];
        const minId = lastOutbound?.telegramMsgId ? parseInt(lastOutbound.telegramMsgId) : 0;

        logger.info(`Last outbound message ID: ${minId}, looking for messages newer than this`);

        const messages = await telegramService.getMessagesFromUser(
          sessionKey,
          prospect.telegramUserId,
          minId
        );

        logger.info(`Got ${messages.length} inbound messages from ${prospectName}`);

        if (messages.length > 0) {
          // Record the first reply (most recent)
          const reply = messages[0];
          logger.info(`Recording reply from ${prospectName}: "${reply.text.substring(0, 100)}"`);

          await this.recordReply(prospect.id, reply.text, reply.id.toString());
          repliesFound++;

          results.push({
            prospectId: prospect.id,
            prospectName,
            replyText: reply.text,
            telegramUserId: prospect.telegramUserId,
          });

          // Auto-convert if enabled
          if (autoConvert) {
            try {
              const lead = await this.convertToLead(prospect.id, tenantId, null);
              logger.info(`Auto-converted prospect ${prospect.id} (${prospectName}) to lead ${lead.id}`);
              results[results.length - 1].convertedLeadId = lead.id;
            } catch (error) {
              logger.warn(`Auto-convert failed for prospect ${prospect.id}: ${error.message}`);
              results[results.length - 1].convertError = error.message;
            }
          }
        }
      } catch (error) {
        const errorMsg = `Error checking replies for prospect ${prospect.id}: ${error.message}`;
        logger.warn(errorMsg);
        errors.push({ prospectId: prospect.id, error: error.message });
      }

      // Small delay between checks to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logger.info(`Reply poll complete for channel ${channelConfigId}: ${repliesFound} replies found out of ${messagedProspects.length} prospects checked`);

    return {
      success: true,
      repliesFound,
      results,
      prospectsChecked: messagedProspects.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Delete a prospect group and all its prospects
   * @param {number} groupId - Group ID
   * @param {number} tenantId - Tenant ID
   */
  async deleteGroup(groupId, tenantId) {
    const group = await prisma.telegramProspectGroup.findFirst({
      where: { id: groupId, tenantId },
    });

    if (!group) {
      throw new Error('Prospect group not found');
    }

    // Delete will cascade to prospects and messages
    await prisma.telegramProspectGroup.delete({
      where: { id: groupId },
    });

    logger.info(`Deleted prospect group ${groupId} (${group.name}) for tenant ${tenantId}`);

    return { deleted: true };
  }

  /**
   * Get messages for a specific prospect
   * @param {number} prospectId - Prospect ID
   * @param {number} tenantId - Tenant ID
   * @returns {Array} Messages
   */
  async getProspectMessages(prospectId, tenantId) {
    const prospect = await prisma.telegramProspect.findFirst({
      where: { id: prospectId, tenantId },
    });

    if (!prospect) {
      throw new Error('Prospect not found');
    }

    const messages = await prisma.telegramProspectMessage.findMany({
      where: { prospectId },
      orderBy: { createdAt: 'asc' },
    });

    return messages;
  }
}

module.exports = new TelegramProspectsService();
