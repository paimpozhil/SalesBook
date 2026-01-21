# SalesBook Development Agents Guide

This document defines specialized AI agent roles for developing and maintaining the SalesBook platform. Each agent has specific responsibilities, context requirements, and guidelines.

---

## Table of Contents

1. [Agent Overview](#agent-overview)
2. [Backend Agents](#backend-agents)
3. [Frontend Agents](#frontend-agents)
4. [Infrastructure Agents](#infrastructure-agents)
5. [Specialized Agents](#specialized-agents)
6. [Agent Communication Protocols](#agent-communication-protocols)
7. [Context Handoff Templates](#context-handoff-templates)

---

## Agent Overview

### Agent Naming Convention
```
[Domain]-[Specialization]-Agent
Example: backend-auth-agent, frontend-leads-agent
```

### Agent Responsibilities Matrix

| Agent | Primary Responsibility | Key Files |
|-------|----------------------|-----------|
| backend-core-agent | Express setup, middleware, routing | `server/src/app.js`, `server/src/middleware/*` |
| backend-auth-agent | Authentication, authorization, JWT | `server/src/services/auth.service.js`, `server/src/routes/auth.js` |
| backend-leads-agent | Lead & contact management | `server/src/services/lead.service.js`, `server/src/routes/leads.js` |
| backend-scraper-agent | Data sources, Playwright, polling | `server/src/scrapers/*`, `server/src/services/scraper.service.js` |
| backend-channels-agent | Email, SMS, WhatsApp, Telegram, Voice | `server/src/services/*-channel.service.js` |
| backend-campaign-agent | Campaigns, sequences, execution | `server/src/services/campaign.service.js` |
| backend-jobs-agent | Background jobs, queue, scheduling | `server/src/jobs/*` |
| frontend-core-agent | React setup, routing, layout | `client/src/App.jsx`, `client/src/components/layout/*` |
| frontend-auth-agent | Login, register, auth state | `client/src/pages/auth/*`, `client/src/store/auth.js` |
| frontend-crm-agent | Leads, contacts, CRM views | `client/src/pages/leads/*`, `client/src/components/leads/*` |
| frontend-campaign-agent | Campaign builder, templates | `client/src/pages/campaigns/*` |
| database-agent | Schema design, migrations, queries | `server/prisma/*` |
| devops-agent | Docker, CI/CD, deployment | `docker-compose.yml`, `Dockerfile`, `scripts/*` |
| testing-agent | Unit tests, integration tests, E2E | `server/tests/*`, `client/tests/*` |

---

## Backend Agents

### backend-core-agent

**Role**: Sets up Express application, middleware stack, error handling, and core infrastructure.

**Responsibilities**:
- Express application configuration
- Middleware setup (CORS, body-parser, helmet, rate-limiting)
- Error handling middleware
- Request logging
- Health check endpoints
- API versioning structure

**Key Files**:
```
server/src/app.js
server/src/config/index.js
server/src/middleware/errorHandler.js
server/src/middleware/validation.js
server/src/utils/logger.js
```

**Context Required**:
- Multi-tenant architecture (tenant isolation via middleware)
- JWT authentication flow
- API response format standards

**Guidelines**:
```markdown
1. All routes must be prefixed with /api/v1
2. Use async/await with try-catch in all controllers
3. Implement request validation using Joi or express-validator
4. Log all errors with stack traces in development
5. Return consistent error response format:
   { success: false, error: { code: string, message: string } }
6. Return consistent success response format:
   { success: true, data: any, meta?: { pagination } }
```

---

### backend-auth-agent

**Role**: Handles all authentication and authorization logic.

**Responsibilities**:
- User registration with email verification
- Login with JWT token generation
- Refresh token rotation
- Password reset flow
- Role-based access control (RBAC)
- Tenant context injection

**Key Files**:
```
server/src/routes/auth.js
server/src/controllers/auth.controller.js
server/src/services/auth.service.js
server/src/middleware/auth.js
server/src/middleware/rbac.js
server/src/middleware/tenant.js
```

**Database Tables**:
- `users`
- `tenants`
- `refresh_tokens` (if implementing token rotation)

**Context Required**:
- Roles: super_admin, tenant_admin, manager, sales_rep
- super_admin has no tenant_id (global access)
- All other users belong to exactly one tenant
- JWT contains: userId, tenantId, role

**Guidelines**:
```markdown
1. Never store plain-text passwords - use bcrypt with cost factor 12
2. JWT access tokens expire in 1 hour
3. Refresh tokens expire in 7 days and are single-use
4. Implement rate limiting on auth endpoints (5 attempts per minute)
5. Tenant middleware must run AFTER auth middleware
6. RBAC checks happen in route-level middleware, not controllers
```

**RBAC Matrix**:
```javascript
const permissions = {
  super_admin: ['*'],  // All permissions
  tenant_admin: ['users:*', 'leads:*', 'campaigns:*', 'channels:*', 'sources:*', 'templates:*', 'analytics:read'],
  manager: ['users:read', 'leads:*', 'campaigns:*', 'channels:read', 'sources:read', 'templates:*', 'analytics:read'],
  sales_rep: ['leads:read', 'leads:update', 'campaigns:read', 'templates:read']
};
```

---

### backend-leads-agent

**Role**: Manages lead and contact CRUD operations, import/export, and bulk actions.

**Responsibilities**:
- Lead CRUD with filtering, sorting, pagination
- Contact management (multiple per lead)
- Lead status transitions
- Tagging system
- Duplicate detection
- Import from CSV/Excel
- Export to CSV/Excel
- Bulk operations

**Key Files**:
```
server/src/routes/leads.js
server/src/routes/contacts.js
server/src/controllers/lead.controller.js
server/src/services/lead.service.js
server/src/utils/importExport.js
```

**Database Tables**:
- `leads`
- `contacts`

**Context Required**:
- All queries must be scoped by tenant_id
- Lead statuses: new, contacted, qualified, negotiation, converted, lost
- Company sizes: micro, small, medium, large, enterprise

**Guidelines**:
```markdown
1. Always include tenant_id in WHERE clauses
2. Soft delete leads (is_deleted flag) to preserve history
3. When creating leads, check for duplicates by company_name + website
4. Contact email/phone are optional but at least one contact field required
5. Bulk operations should be transactional
6. Limit bulk operations to 1000 records per request
7. Export should stream data for large datasets
```

**Filter Schema**:
```javascript
{
  search: string,           // Searches company_name, website, contact emails
  status: string[],         // Filter by status
  industry: string[],       // Filter by industry
  size: string[],           // Filter by company size
  source_id: number[],      // Filter by data source
  tags: string[],           // Filter by tags (AND logic)
  created_after: date,
  created_before: date,
  assigned_to: number       // User ID
}
```

---

### backend-scraper-agent

**Role**: Implements data source handlers for collecting leads from external sources.

**Responsibilities**:
- Playwright-based web scraping
- API/JSON endpoint polling
- RSS feed parsing
- Proxy management
- Rate limiting
- Error handling and retries
- Lead deduplication during import

**Key Files**:
```
server/src/routes/dataSources.js
server/src/controllers/dataSource.controller.js
server/src/services/scraper.service.js
server/src/scrapers/playwright.scraper.js
server/src/scrapers/api.scraper.js
server/src/scrapers/rss.scraper.js
server/src/utils/proxyManager.js
```

**Database Tables**:
- `data_sources`
- `data_source_runs`

**Context Required**:
- Scraper configs are JSON stored in data_sources.config
- Support for authentication (form login, API keys, OAuth)
- Pagination handling (click-based, URL params, cursor)
- Field mapping from source to lead schema

**Guidelines**:
```markdown
1. Always run scrapers in isolated browser contexts
2. Implement exponential backoff on failures
3. Respect rate_limit field (requests per minute)
4. Log all scraper activity to data_source_runs
5. Validate extracted data before creating leads
6. Handle CAPTCHAs gracefully (pause and notify)
7. Store Playwright scripts in storage/scripts/{tenant_id}/
8. Never store credentials in plain text - encrypt with ENCRYPTION_KEY
```

**Scraper Config Schema**:
```javascript
{
  type: 'playwright' | 'api' | 'rss',
  url: string,
  config: {
    // Playwright-specific
    browser: 'chromium' | 'firefox' | 'webkit',
    headless: boolean,
    auth: { type, steps },
    pagination: { type, selector, maxPages },
    extraction: { containerSelector, fields },

    // API-specific
    method: 'GET' | 'POST',
    headers: object,
    body: object,
    pagination: { type, params },
    mapping: { root, fields },

    // RSS-specific
    mapping: { fields }
  },
  proxy_config: {
    enabled: boolean,
    type: 'static' | 'rotating',
    url: string,
    auth: { username, password }
  },
  rate_limit: number,
  polling_frequency: string  // Cron expression
}
```

---

### backend-channels-agent

**Role**: Implements communication channel integrations.

**Responsibilities**:
- Email: SMTP and API providers (Mailchimp, Mandrill, SendGrid, SES)
- SMS: Twilio integration
- WhatsApp Web: whatsapp-web.js integration
- WhatsApp Business: Cloud API integration
- Telegram: Bot API integration
- Voice: Twilio voice calls
- Webhook handlers for delivery/read receipts

**Key Files**:
```
server/src/routes/channels.js
server/src/controllers/channel.controller.js
server/src/services/email.service.js
server/src/services/sms.service.js
server/src/services/whatsapp.service.js
server/src/services/whatsappBusiness.service.js
server/src/services/telegram.service.js
server/src/services/voice.service.js
server/src/routes/webhooks.js
```

**Database Tables**:
- `channel_configs`
- `contact_attempts`

**Context Required**:
- Each tenant can have multiple channel configs
- Credentials are encrypted at rest
- Track all sends in contact_attempts table
- Handle async delivery status updates via webhooks

**Guidelines**:
```markdown
1. All channel services must implement ChannelInterface:
   - send(recipient, message, options): Promise<SendResult>
   - getStatus(externalId): Promise<StatusResult>
   - validateConfig(config): Promise<boolean>
2. Encrypt all credentials using utils/encryption.js
3. Implement connection pooling for SMTP
4. WhatsApp Web sessions stored in storage/whatsapp/{tenant_id}/
5. Rate limit sends per channel config
6. Log all sends to contact_attempts immediately
7. Update contact_attempts status via webhooks asynchronously
```

**Channel Config Schema**:
```javascript
{
  channel_type: 'email_smtp' | 'email_api' | 'sms' | 'whatsapp_web' | 'whatsapp_business' | 'telegram' | 'voice',
  provider: string,
  credentials: {
    // Encrypted JSON - varies by provider
  },
  settings: {
    from_name: string,
    from_email: string,
    from_phone: string,
    daily_limit: number,
    hourly_limit: number
  }
}
```

---

### backend-campaign-agent

**Role**: Manages campaign creation, sequencing, and execution.

**Responsibilities**:
- Campaign CRUD
- Sequence step management
- Recipient targeting (lead filters)
- Campaign execution orchestration
- Step scheduling and delays
- Skip logic (if replied, unsubscribed)
- Campaign analytics

**Key Files**:
```
server/src/routes/campaigns.js
server/src/controllers/campaign.controller.js
server/src/services/campaign.service.js
server/src/services/template.service.js
server/src/utils/templateEngine.js
```

**Database Tables**:
- `campaigns`
- `campaign_steps`
- `campaign_recipients`
- `templates`

**Context Required**:
- Campaign types: immediate, scheduled, sequence
- Templates use {{variable}} syntax
- Sequences have delays in days/hours
- Recipients tracked individually through steps

**Guidelines**:
```markdown
1. Campaign creation is a multi-step process - validate at each step
2. When starting campaign, snapshot target leads (don't use live filter)
3. Create campaign_recipients for each lead/contact pair
4. Schedule first step immediately or at scheduled time
5. After each step, check for replies before scheduling next
6. Respect channel rate limits when executing
7. Allow pause/resume without losing progress
8. Template variables resolved at send time, not schedule time
```

**Template Variables**:
```javascript
{
  // Lead variables
  'lead.company_name': lead.company_name,
  'lead.website': lead.website,
  'lead.industry': lead.industry,
  'lead.size': lead.size,

  // Contact variables
  'contact.name': contact.name,
  'contact.email': contact.email,
  'contact.phone': contact.phone,
  'contact.position': contact.position,

  // System variables
  'unsubscribe_link': generateUnsubscribeLink(recipient),
  'current_date': formatDate(new Date()),
  'sender.name': channelConfig.settings.from_name,
  'sender.email': channelConfig.settings.from_email
}
```

---

### backend-jobs-agent

**Role**: Implements background job processing and scheduling.

**Responsibilities**:
- Job queue implementation (MySQL-backed)
- Job scheduling with node-cron
- Worker processes for different job types
- Job retry logic
- Dead letter handling
- Job monitoring

**Key Files**:
```
server/src/jobs/queue.js
server/src/jobs/scheduler.js
server/src/jobs/workers/scraper.worker.js
server/src/jobs/workers/campaign.worker.js
server/src/jobs/workers/poller.worker.js
server/src/jobs/workers/webhook.worker.js
```

**Database Tables**:
- `job_queue`

**Context Required**:
- Jobs are tenant-scoped (except system jobs)
- Job types: scrape, campaign_step, poll, webhook, cleanup
- Priority levels 1-10 (1 = highest)
- Configurable retry with exponential backoff

**Guidelines**:
```markdown
1. Poll job_queue every 5 seconds for pending jobs
2. Process jobs in priority order, then by scheduled_at
3. Lock jobs before processing (set status = 'processing')
4. Implement job timeout (default 5 minutes)
5. Max 3 retries with exponential backoff (1min, 5min, 15min)
6. Move failed jobs to dead letter after max retries
7. Clean up completed jobs older than 7 days
8. Log job execution time and results
```

**Job Schema**:
```javascript
{
  tenant_id: number | null,
  type: 'scrape' | 'campaign_step' | 'poll' | 'webhook' | 'cleanup',
  payload: {
    // Type-specific data
  },
  priority: 1-10,
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retry',
  attempts: number,
  max_attempts: 3,
  scheduled_at: datetime,
  started_at: datetime | null,
  completed_at: datetime | null,
  error_message: string | null
}
```

---

## Frontend Agents

### frontend-core-agent

**Role**: Sets up React application structure, routing, and shared components.

**Responsibilities**:
- Vite + React configuration
- React Router setup
- Layout components (Navbar, Sidebar, Footer)
- Common UI components (Button, Modal, Table, Form inputs)
- Theme configuration (Bootstrap customization)
- Toast notifications
- Loading states

**Key Files**:
```
client/src/App.jsx
client/src/main.jsx
client/vite.config.js
client/src/components/layout/MainLayout.jsx
client/src/components/layout/Navbar.jsx
client/src/components/layout/Sidebar.jsx
client/src/components/common/*
client/src/assets/styles/custom.scss
```

**Context Required**:
- Bootstrap 5 with React-Bootstrap
- Authenticated routes wrapped in AuthLayout
- Public routes (login, register) have no sidebar
- Responsive design (mobile-first)

**Guidelines**:
```markdown
1. Use functional components with hooks
2. Implement lazy loading for route components
3. Create reusable components in components/common/
4. Use Bootstrap utility classes, avoid custom CSS when possible
5. Implement consistent loading and error states
6. Toast notifications for user feedback
7. Mobile-responsive sidebar (collapsible)
```

---

### frontend-auth-agent

**Role**: Implements authentication UI and state management.

**Responsibilities**:
- Login page
- Registration page (tenant self-registration)
- Forgot password flow
- Auth state management
- Protected route wrapper
- Token refresh handling
- Logout

**Key Files**:
```
client/src/pages/auth/Login.jsx
client/src/pages/auth/Register.jsx
client/src/pages/auth/ForgotPassword.jsx
client/src/pages/auth/ResetPassword.jsx
client/src/store/authStore.js
client/src/hooks/useAuth.js
client/src/components/auth/ProtectedRoute.jsx
client/src/services/authApi.js
```

**Context Required**:
- JWT stored in memory (not localStorage for security)
- Refresh token in httpOnly cookie (or localStorage as fallback)
- Redirect to login on 401
- Role-based UI visibility

**Guidelines**:
```markdown
1. Store access token in memory (React state/context)
2. Implement silent token refresh before expiry
3. Clear all auth state on logout
4. Show role-appropriate navigation items
5. Implement "Remember me" with refresh token
6. Validate forms client-side before submission
```

---

### frontend-crm-agent

**Role**: Builds the lead management interface.

**Responsibilities**:
- Lead list with DataTable (sorting, filtering, pagination)
- Lead detail view
- Lead create/edit forms
- Contact management within leads
- Bulk actions UI
- Import/Export UI
- Quick search

**Key Files**:
```
client/src/pages/leads/LeadList.jsx
client/src/pages/leads/LeadDetail.jsx
client/src/pages/leads/LeadForm.jsx
client/src/components/leads/LeadTable.jsx
client/src/components/leads/LeadFilters.jsx
client/src/components/leads/ContactCard.jsx
client/src/components/leads/ImportModal.jsx
client/src/services/leadApi.js
```

**Context Required**:
- Leads have multiple contacts
- Support for custom fields (render dynamically)
- Inline editing for quick updates
- Bulk select with shift-click

**Guidelines**:
```markdown
1. Use react-table or similar for data grid
2. Implement debounced search (300ms)
3. Persist filter state in URL params
4. Show contact count badge on lead cards
5. Optimistic updates for better UX
6. Confirm destructive actions (delete, bulk delete)
```

---

### frontend-campaign-agent

**Role**: Builds campaign and template management UI.

**Responsibilities**:
- Template editor with variable insertion
- Campaign creation wizard
- Sequence builder (drag-and-drop steps)
- Recipient targeting (visual filter builder)
- Campaign status dashboard
- Campaign detail with recipient progress

**Key Files**:
```
client/src/pages/campaigns/CampaignList.jsx
client/src/pages/campaigns/CampaignWizard.jsx
client/src/pages/campaigns/CampaignDetail.jsx
client/src/pages/templates/TemplateList.jsx
client/src/pages/templates/TemplateEditor.jsx
client/src/components/campaigns/SequenceBuilder.jsx
client/src/components/campaigns/RecipientFilter.jsx
client/src/components/campaigns/StepCard.jsx
client/src/services/campaignApi.js
client/src/services/templateApi.js
```

**Context Required**:
- Templates have channel-specific fields (email has subject)
- Sequence builder shows timeline visualization
- Variable insertion via dropdown or {{typing}}
- Preview mode shows rendered template

**Guidelines**:
```markdown
1. Wizard pattern for campaign creation (multi-step form)
2. Validate template variables exist before save
3. Show estimated recipient count while building filter
4. Allow template preview with sample lead data
5. Sequence builder should show delays visually
6. Disable editing for active campaigns (pause first)
```

---

## Infrastructure Agents

### database-agent

**Role**: Manages database schema, migrations, and query optimization.

**Responsibilities**:
- Prisma schema design
- Migration creation and management
- Seed data for development
- Index optimization
- Query performance analysis

**Key Files**:
```
server/prisma/schema.prisma
server/prisma/migrations/*
server/prisma/seed.js
```

**Guidelines**:
```markdown
1. Always add tenant_id to tenant-scoped tables
2. Create indexes for frequently filtered columns
3. Use foreign keys with appropriate ON DELETE actions
4. Soft delete for data that needs audit trail
5. Use JSON columns sparingly (only for truly dynamic data)
6. Add created_at and updated_at to all tables
7. Test migrations both up and down
```

---

### devops-agent

**Role**: Manages containerization, deployment, and CI/CD.

**Responsibilities**:
- Dockerfile optimization
- Docker Compose for local development
- Environment configuration
- CI/CD pipeline (GitHub Actions)
- Production deployment scripts
- Backup and restore procedures

**Key Files**:
```
Dockerfile
docker-compose.yml
.github/workflows/*
scripts/*
.env.example
```

**Guidelines**:
```markdown
1. Multi-stage Docker builds for smaller images
2. Non-root user in containers
3. Health checks for all services
4. Environment-specific compose files
5. Secrets management (never commit .env)
6. Automated database backups
7. Zero-downtime deployment strategy
```

---

## Specialized Agents

### testing-agent

**Role**: Implements comprehensive test coverage.

**Responsibilities**:
- Unit tests for services
- Integration tests for APIs
- E2E tests for critical flows
- Test fixtures and factories
- Coverage reporting

**Key Files**:
```
server/tests/unit/*
server/tests/integration/*
client/src/**/*.test.jsx
e2e/*
jest.config.js
playwright.config.js (for E2E)
```

**Guidelines**:
```markdown
1. Minimum 80% coverage for services
2. Test all API endpoints with valid and invalid inputs
3. Mock external services (Twilio, email providers)
4. Use factories for test data generation
5. E2E tests for: auth flow, lead CRUD, campaign creation
6. Run tests in CI before merge
```

---

## Agent Communication Protocols

### Handoff Protocol

When one agent completes work that affects another agent's domain:

```markdown
## Handoff: [Source Agent] → [Target Agent]

### Completed Work
- [List of completed items]

### Files Modified
- [List of files with brief description of changes]

### Dependencies Created
- [New functions, types, or interfaces the target agent should use]

### Action Required
- [Specific tasks for the target agent]

### Testing Notes
- [How to verify the integration works]
```

### Example Handoff

```markdown
## Handoff: backend-auth-agent → frontend-auth-agent

### Completed Work
- Implemented login endpoint POST /api/v1/auth/login
- Implemented register endpoint POST /api/v1/auth/register
- Added JWT middleware

### Files Modified
- server/src/routes/auth.js - Auth routes
- server/src/services/auth.service.js - Auth business logic
- server/src/middleware/auth.js - JWT verification

### Dependencies Created
- Login returns: { accessToken, user: { id, email, name, role, tenantId } }
- Register requires: { email, password, name, companyName }

### Action Required
- Build login form posting to /api/v1/auth/login
- Build registration form posting to /api/v1/auth/register
- Store accessToken in auth context
- Implement ProtectedRoute component

### Testing Notes
- Test user: test@example.com / password123
- Invalid credentials return 401
- Missing fields return 400 with validation errors
```

---

## Context Handoff Templates

### New Feature Context

```markdown
## Feature: [Feature Name]

### Overview
[Brief description of the feature]

### User Stories
- As a [role], I want to [action] so that [benefit]

### Technical Requirements
- [List of technical requirements]

### Database Changes
- [New tables or columns]

### API Endpoints
- [New endpoints with request/response format]

### UI Components
- [New pages and components needed]

### Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]
```

### Bug Fix Context

```markdown
## Bug: [Bug Title]

### Description
[What's happening vs what should happen]

### Steps to Reproduce
1. [Step 1]
2. [Step 2]

### Root Cause
[Analysis of why it's happening]

### Proposed Fix
[How to fix it]

### Files to Modify
- [File 1]: [What to change]
- [File 2]: [What to change]

### Testing
- [How to verify the fix]
```

---

## Quick Reference: Which Agent to Use

| Task | Agent |
|------|-------|
| Setup new API endpoint | backend-core-agent |
| Add authentication to route | backend-auth-agent |
| Create lead filter feature | backend-leads-agent |
| Add new scraping source type | backend-scraper-agent |
| Integrate new email provider | backend-channels-agent |
| Build campaign sequence logic | backend-campaign-agent |
| Add scheduled job | backend-jobs-agent |
| Create new page layout | frontend-core-agent |
| Build login form | frontend-auth-agent |
| Add lead table feature | frontend-crm-agent |
| Build template editor | frontend-campaign-agent |
| Add database table | database-agent |
| Setup Docker service | devops-agent |
| Write API tests | testing-agent |
