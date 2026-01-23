const prisma = require('../config/database');

/**
 * Get or create an industry by name for a tenant
 * @param {number} tenantId - The tenant ID
 * @param {string} name - The industry name
 * @returns {Promise<Object>} The industry object
 */
async function getOrCreateIndustry(tenantId, name) {
  if (!name || typeof name !== 'string') {
    return null;
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return null;
  }

  // Try to find existing industry
  let industry = await prisma.industry.findFirst({
    where: { tenantId, name: trimmedName },
  });

  // Create if not exists
  if (!industry) {
    industry = await prisma.industry.create({
      data: { tenantId, name: trimmedName },
    });
  }

  return industry;
}

/**
 * Get or create multiple industries by names for a tenant
 * @param {number} tenantId - The tenant ID
 * @param {string[]} names - Array of industry names
 * @returns {Promise<Object[]>} Array of industry objects
 */
async function getOrCreateIndustries(tenantId, names) {
  if (!names || !Array.isArray(names)) {
    return [];
  }

  const industries = [];
  for (const name of names) {
    const industry = await getOrCreateIndustry(tenantId, name);
    if (industry) {
      industries.push(industry);
    }
  }

  return industries;
}

/**
 * Link industries to a lead
 * @param {number} leadId - The lead ID
 * @param {number[]} industryIds - Array of industry IDs
 */
async function linkIndustriesToLead(leadId, industryIds) {
  if (!industryIds || !industryIds.length) {
    return;
  }

  // Remove existing links
  await prisma.leadIndustry.deleteMany({
    where: { leadId },
  });

  // Create new links
  await prisma.leadIndustry.createMany({
    data: industryIds.map((industryId) => ({
      leadId,
      industryId,
    })),
    skipDuplicates: true,
  });
}

/**
 * Get all industries for a tenant
 * @param {number} tenantId - The tenant ID
 * @returns {Promise<Object[]>} Array of industry objects
 */
async function getIndustriesForTenant(tenantId) {
  return prisma.industry.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

/**
 * Get industries for a lead
 * @param {number} leadId - The lead ID
 * @returns {Promise<Object[]>} Array of industry objects
 */
async function getIndustriesForLead(leadId) {
  const leadIndustries = await prisma.leadIndustry.findMany({
    where: { leadId },
    include: { industry: true },
  });

  return leadIndustries.map((li) => li.industry);
}

module.exports = {
  getOrCreateIndustry,
  getOrCreateIndustries,
  linkIndustriesToLead,
  getIndustriesForTenant,
  getIndustriesForLead,
};
