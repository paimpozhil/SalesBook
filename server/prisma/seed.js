const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create super admin user (no tenant)
  const superAdminPassword = await bcrypt.hash('Admin123!', 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@salesbook.local' },
    update: {},
    create: {
      email: 'admin@salesbook.local',
      passwordHash: superAdminPassword,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log('Created super admin:', superAdmin.email);

  // Create demo tenant
  const demoTenant = await prisma.tenant.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      name: 'Demo Company',
      slug: 'demo-company',
      status: 'ACTIVE',
      settings: {},
    },
  });

  console.log('Created demo tenant:', demoTenant.name);

  // Create tenant admin
  const tenantAdminPassword = await bcrypt.hash('Demo123!', 12);

  const tenantAdmin = await prisma.user.upsert({
    where: { email: 'demo@salesbook.local' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      email: 'demo@salesbook.local',
      passwordHash: tenantAdminPassword,
      name: 'Demo Admin',
      role: 'TENANT_ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log('Created tenant admin:', tenantAdmin.email);

  // Create sales rep
  const salesRepPassword = await bcrypt.hash('Sales123!', 12);

  const salesRep = await prisma.user.upsert({
    where: { email: 'sales@salesbook.local' },
    update: {},
    create: {
      tenantId: demoTenant.id,
      email: 'sales@salesbook.local',
      passwordHash: salesRepPassword,
      name: 'Sales Rep',
      role: 'SALES_REP',
      status: 'ACTIVE',
    },
  });

  console.log('Created sales rep:', salesRep.email);

  // Create sample leads
  const leads = [
    {
      companyName: 'Acme Corporation',
      website: 'https://acme.example.com',
      industry: 'Technology',
      size: 'LARGE',
      status: 'NEW',
      tags: ['enterprise', 'tech'],
    },
    {
      companyName: 'Global Solutions Inc',
      website: 'https://globalsolutions.example.com',
      industry: 'Consulting',
      size: 'MEDIUM',
      status: 'CONTACTED',
      tags: ['consulting', 'b2b'],
    },
    {
      companyName: 'StartupXYZ',
      website: 'https://startupxyz.example.com',
      industry: 'SaaS',
      size: 'SMALL',
      status: 'QUALIFIED',
      tags: ['startup', 'saas'],
    },
    {
      companyName: 'Enterprise Plus',
      website: 'https://enterpriseplus.example.com',
      industry: 'Finance',
      size: 'ENTERPRISE',
      status: 'NEGOTIATION',
      tags: ['finance', 'enterprise'],
    },
    {
      companyName: 'Local Business Co',
      website: 'https://localbusiness.example.com',
      industry: 'Retail',
      size: 'MICRO',
      status: 'NEW',
      tags: ['retail', 'local'],
    },
  ];

  for (const leadData of leads) {
    const lead = await prisma.lead.create({
      data: {
        tenantId: demoTenant.id,
        ...leadData,
        createdById: tenantAdmin.id,
        contacts: {
          create: [
            {
              tenantId: demoTenant.id,
              name: `John at ${leadData.companyName.split(' ')[0]}`,
              email: `john@${leadData.companyName.toLowerCase().replace(/\s+/g, '')}.com`,
              phone: '+1-555-0100',
              position: 'CEO',
              isPrimary: true,
            },
            {
              tenantId: demoTenant.id,
              name: `Jane at ${leadData.companyName.split(' ')[0]}`,
              email: `jane@${leadData.companyName.toLowerCase().replace(/\s+/g, '')}.com`,
              position: 'CTO',
              isPrimary: false,
            },
          ],
        },
      },
    });
    console.log('Created lead:', lead.companyName);
  }

  // Create sample templates
  const emailTemplate = await prisma.template.create({
    data: {
      tenantId: demoTenant.id,
      name: 'Introduction Email',
      channelType: 'EMAIL_SMTP',
      subject: 'Hello from {{sender.name}} - Quick Introduction',
      body: `<p>Hi {{contact.name}},</p>

<p>I noticed that {{lead.company_name}} is doing great work in the {{lead.industry}} space.</p>

<p>I'd love to learn more about your current challenges and see if we might be able to help.</p>

<p>Would you have 15 minutes for a quick call this week?</p>

<p>Best regards,<br>
{{sender.name}}</p>

<p style="font-size: 12px; color: #666;">
<a href="{{unsubscribe_link}}">Unsubscribe</a>
</p>`,
      createdById: tenantAdmin.id,
    },
  });
  console.log('Created template:', emailTemplate.name);

  const smsTemplate = await prisma.template.create({
    data: {
      tenantId: demoTenant.id,
      name: 'Follow-up SMS',
      channelType: 'SMS',
      body: 'Hi {{contact.name}}, following up on my email about {{lead.company_name}}. Would you have time for a quick call? Reply YES and I\'ll send calendar options.',
      createdById: tenantAdmin.id,
    },
  });
  console.log('Created template:', smsTemplate.name);

  console.log('\nSeeding completed!');
  console.log('\n--- Login Credentials ---');
  console.log('Super Admin:');
  console.log('  Email: admin@salesbook.local');
  console.log('  Password: Admin123!');
  console.log('\nTenant Admin:');
  console.log('  Email: demo@salesbook.local');
  console.log('  Password: Demo123!');
  console.log('\nSales Rep:');
  console.log('  Email: sales@salesbook.local');
  console.log('  Password: Sales123!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
