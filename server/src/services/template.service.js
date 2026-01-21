/**
 * Template rendering service
 * Handles variable substitution in email/SMS templates
 */

/**
 * Render a template with given context
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {Object} context - Variables to substitute
 * @returns {string} - Rendered template
 */
function render(template, context) {
  if (!template) return '';

  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const value = getNestedValue(context, path.trim());
    return value !== undefined && value !== null ? String(value) : match;
  });
}

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to search
 * @param {string} path - Dot-notation path (e.g., "lead.company_name")
 * @returns {*} - Value at path or undefined
 */
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let value = obj;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Extract all variables from a template
 * @param {string} template - Template string
 * @returns {string[]} - Array of variable paths
 */
function extractVariables(template) {
  if (!template) return [];

  const regex = /\{\{([^}]+)\}\}/g;
  const variables = [];
  let match;

  while ((match = regex.exec(template)) !== null) {
    const variable = match[1].trim();
    if (!variables.includes(variable)) {
      variables.push(variable);
    }
  }

  return variables;
}

/**
 * Validate that all required variables are present in context
 * @param {string} template - Template string
 * @param {Object} context - Variables context
 * @returns {Object} - { valid: boolean, missing: string[] }
 */
function validateContext(template, context) {
  const variables = extractVariables(template);
  const missing = [];

  for (const variable of variables) {
    const value = getNestedValue(context, variable);
    if (value === undefined || value === null) {
      missing.push(variable);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Build context object from lead and contact data
 * @param {Object} options - Context building options
 * @param {Object} options.lead - Lead record
 * @param {Object} options.contact - Contact record
 * @param {Object} options.sender - Sender/user record
 * @param {Object} options.tenant - Tenant record
 * @param {Object} options.custom - Custom variables
 * @returns {Object} - Context for template rendering
 */
function buildContext({ lead, contact, sender, tenant, custom = {} }) {
  const context = {
    ...custom,
  };

  if (lead) {
    context.lead = {
      id: lead.id,
      company_name: lead.companyName,
      companyName: lead.companyName,
      website: lead.website,
      industry: lead.industry,
      size: lead.size,
      status: lead.status,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      country: lead.country,
      postalCode: lead.postalCode,
      notes: lead.notes,
    };
  }

  if (contact) {
    context.contact = {
      id: contact.id,
      name: contact.name,
      first_name: contact.name?.split(' ')[0] || '',
      firstName: contact.name?.split(' ')[0] || '',
      last_name: contact.name?.split(' ').slice(1).join(' ') || '',
      lastName: contact.name?.split(' ').slice(1).join(' ') || '',
      email: contact.email,
      phone: contact.phone,
      position: contact.position,
      title: contact.position,
    };
  }

  if (sender) {
    context.sender = {
      id: sender.id,
      name: sender.name,
      email: sender.email,
    };
  }

  if (tenant) {
    context.company = {
      name: tenant.name,
    };
    context.tenant = {
      name: tenant.name,
    };
  }

  // Add special links
  context.unsubscribe_link = `{{unsubscribe_link}}`; // Will be replaced by actual link at send time

  // Add date helpers
  const now = new Date();
  context.date = {
    today: now.toLocaleDateString(),
    year: now.getFullYear(),
    month: now.toLocaleString('default', { month: 'long' }),
  };

  return context;
}

/**
 * Preview a template with sample data
 * @param {string} template - Template string
 * @param {Object} sampleData - Sample data for preview
 * @returns {string} - Rendered preview
 */
function preview(template, sampleData = {}) {
  const defaultSample = {
    lead: {
      company_name: 'Acme Corporation',
      companyName: 'Acme Corporation',
      website: 'https://acme.example.com',
      industry: 'Technology',
      size: 'MEDIUM',
    },
    contact: {
      name: 'John Doe',
      first_name: 'John',
      firstName: 'John',
      last_name: 'Doe',
      lastName: 'Doe',
      email: 'john@acme.example.com',
      phone: '+1-555-0100',
      position: 'CEO',
    },
    sender: {
      name: 'Your Name',
      email: 'you@yourcompany.com',
    },
    company: {
      name: 'Your Company',
    },
    date: {
      today: new Date().toLocaleDateString(),
      year: new Date().getFullYear(),
      month: new Date().toLocaleString('default', { month: 'long' }),
    },
    unsubscribe_link: '#unsubscribe',
  };

  const context = {
    ...defaultSample,
    ...sampleData,
  };

  return render(template, context);
}

module.exports = {
  render,
  extractVariables,
  validateContext,
  buildContext,
  preview,
  getNestedValue,
};
