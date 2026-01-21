# SalesBook - Lead Generation & CRM Platform

## Project Overview

SalesBook is a multi-tenant lead generation and CRM platform that allows users to:
- Collect leads from various sources (web scraping, APIs, RSS, manual entry)
- Store and manage leads in a CRM interface
- Execute multi-channel outreach campaigns (Email, SMS, WhatsApp, Telegram, Voice)
- Track all contact attempts and conversations

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18+ with Vite |
| UI Framework | Bootstrap 5 / React-Bootstrap |
| Backend | Node.js with Express.js |
| Database | MySQL 8.0+ |
| ORM | Prisma |
| Authentication | JWT (JSON Web Tokens) |
| Background Jobs | Node-cron + MySQL-backed queue |
| Web Scraping | Playwright |
| File Storage | Local filesystem |
| Containerization | Docker (optional) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React)                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │   Auth UI   │ │  CRM Views  │ │  Campaigns  │ │  Analytics  │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Node.js/Express)                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │  Auth API   │ │  Leads API  │ │ Campaign API│ │ Scraper API │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                   │
│  │ Channels API│ │Analytics API│ │  Admin API  │                   │
│  └─────────────┘ └─────────────┘ └─────────────┘                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
            ┌───────────┐ ┌───────────┐ ┌───────────────┐
            │   MySQL   │ │  Job Queue│ │ File Storage  │
            │  Database │ │  (MySQL)  │ │   (Local)     │
            └───────────┘ └───────────┘ └───────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKGROUND WORKERS                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │  Scraper    │ │  Campaign   │ │   Poller    │ │  Webhook    │   │
│  │  Worker     │ │  Executor   │ │   Worker    │ │  Processor  │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL INTEGRATIONS                             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│  │  SMTP  │ │Mailchimp│ │ Twilio │ │WhatsApp│ │Telegram│ │ Proxy  │ │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Multi-Tenancy Model
All tenant-specific tables include a `tenant_id` column for data isolation.

### Core Tables

```sql
-- Super Admin & Tenant Management
tenants
├── id (PK)
├── name
├── slug (unique subdomain/identifier)
├── status (active/suspended/trial)
├── settings (JSON - tenant-specific config)
├── created_at
└── updated_at

users
├── id (PK)
├── tenant_id (FK, nullable for super-admin)
├── email (unique)
├── password_hash
├── name
├── role (super_admin/tenant_admin/manager/sales_rep)
├── status (active/inactive/pending)
├── last_login_at
├── created_at
└── updated_at

-- Lead Management
leads
├── id (PK)
├── tenant_id (FK)
├── company_name
├── website
├── industry
├── size (enum: micro/small/medium/large/enterprise)
├── source_id (FK to data_sources)
├── status (new/contacted/qualified/converted/lost)
├── tags (JSON array)
├── custom_fields (JSON)
├── created_by (FK to users)
├── created_at
└── updated_at

contacts
├── id (PK)
├── tenant_id (FK)
├── lead_id (FK)
├── name (nullable)
├── email (nullable)
├── phone (nullable)
├── position (nullable)
├── is_primary (boolean)
├── created_at
└── updated_at

-- Data Source Configuration
data_sources
├── id (PK)
├── tenant_id (FK)
├── name
├── type (enum: playwright/api/rss/json/manual)
├── url
├── config (JSON - scraping config, selectors, auth)
├── proxy_config (JSON - proxy settings)
├── rate_limit (requests per minute)
├── polling_frequency (cron expression or interval)
├── is_active (boolean)
├── last_run_at
├── last_status (success/failed/running)
├── created_at
└── updated_at

data_source_runs
├── id (PK)
├── data_source_id (FK)
├── status (pending/running/success/failed)
├── leads_found (count)
├── leads_created (count)
├── leads_updated (count)
├── error_message
├── logs (TEXT)
├── started_at
├── completed_at
└── created_at

-- Communication Channels
channel_configs
├── id (PK)
├── tenant_id (FK)
├── channel_type (email_smtp/email_api/sms/whatsapp_web/whatsapp_business/telegram/voice)
├── provider (smtp/mailchimp/mandrill/saleshandy/twilio/etc)
├── name (friendly name)
├── credentials (JSON - encrypted)
├── settings (JSON - sender info, limits)
├── is_active (boolean)
├── created_at
└── updated_at

-- Templates
templates
├── id (PK)
├── tenant_id (FK)
├── name
├── channel_type
├── subject (for email)
├── body (with {{variable}} placeholders)
├── attachments (JSON array of file paths)
├── created_by (FK)
├── created_at
└── updated_at

-- Campaigns
campaigns
├── id (PK)
├── tenant_id (FK)
├── name
├── status (draft/active/paused/completed)
├── type (immediate/scheduled/sequence)
├── target_filter (JSON - lead filter criteria)
├── created_by (FK)
├── started_at
├── completed_at
├── created_at
└── updated_at

campaign_steps
├── id (PK)
├── campaign_id (FK)
├── step_order
├── channel_type
├── channel_config_id (FK)
├── template_id (FK)
├── delay_days (days after previous step)
├── delay_hours
├── send_time (preferred time of day)
├── created_at
└── updated_at

campaign_recipients
├── id (PK)
├── campaign_id (FK)
├── lead_id (FK)
├── contact_id (FK)
├── current_step (step_order)
├── status (pending/in_progress/completed/failed/unsubscribed)
├── next_action_at
├── created_at
└── updated_at

-- Contact Attempts & Tracking
contact_attempts
├── id (PK)
├── tenant_id (FK)
├── lead_id (FK)
├── contact_id (FK)
├── campaign_id (FK, nullable)
├── campaign_step_id (FK, nullable)
├── channel_type
├── channel_config_id (FK)
├── direction (outbound/inbound)
├── status (pending/sent/delivered/failed/bounced)
├── subject (for email)
├── content
├── external_id (provider message ID)
├── metadata (JSON - delivery info, timestamps)
├── sent_at
├── delivered_at
├── opened_at
├── clicked_at
├── replied_at
├── created_at
└── updated_at

conversations
├── id (PK)
├── tenant_id (FK)
├── lead_id (FK)
├── contact_id (FK)
├── channel_type
├── last_message_at
├── status (open/closed)
├── assigned_to (FK to users)
├── created_at
└── updated_at

messages
├── id (PK)
├── conversation_id (FK)
├── contact_attempt_id (FK, nullable)
├── direction (inbound/outbound)
├── content
├── attachments (JSON)
├── metadata (JSON)
├── created_at
└── updated_at

-- Background Job Queue
job_queue
├── id (PK)
├── tenant_id (FK, nullable)
├── type (scrape/campaign_step/poll/webhook)
├── payload (JSON)
├── priority (1-10)
├── status (pending/processing/completed/failed/retry)
├── attempts
├── max_attempts
├── scheduled_at
├── started_at
├── completed_at
├── error_message
├── created_at
└── updated_at

-- Analytics (aggregated)
analytics_daily
├── id (PK)
├── tenant_id (FK)
├── date
├── channel_type
├── campaign_id (FK, nullable)
├── sent_count
├── delivered_count
├── opened_count
├── clicked_count
├── replied_count
├── bounced_count
├── failed_count
├── created_at
└── updated_at
```

---

## Feature Modules

### 1. Authentication & Authorization

**Features:**
- JWT-based authentication with refresh tokens
- Role-based access control (RBAC)
- Tenant self-registration with email verification
- Password reset flow
- Session management

**Roles:**
| Role | Permissions |
|------|-------------|
| super_admin | Full system access, manage tenants |
| tenant_admin | Full tenant access, manage users & settings |
| manager | Manage leads, campaigns, view reports |
| sales_rep | View/edit assigned leads, execute campaigns |

---

### 2. Data Source Management

**Supported Source Types:**

#### a) Playwright Scraper
```json
{
  "type": "playwright",
  "url": "https://example.com/companies",
  "config": {
    "browser": "chromium",
    "headless": true,
    "viewport": { "width": 1920, "height": 1080 },
    "auth": {
      "type": "form",
      "loginUrl": "https://example.com/login",
      "steps": [
        { "action": "fill", "selector": "#email", "value": "{{username}}" },
        { "action": "fill", "selector": "#password", "value": "{{password}}" },
        { "action": "click", "selector": "#submit" },
        { "action": "waitForNavigation" }
      ]
    },
    "pagination": {
      "type": "click",
      "nextSelector": ".next-page",
      "maxPages": 10
    },
    "extraction": {
      "containerSelector": ".company-card",
      "fields": {
        "company_name": { "selector": ".company-name", "attribute": "text" },
        "website": { "selector": "a.website", "attribute": "href" },
        "industry": { "selector": ".industry", "attribute": "text" },
        "size": { "selector": ".company-size", "attribute": "text" },
        "contacts": {
          "selector": ".contact-person",
          "multiple": true,
          "fields": {
            "name": { "selector": ".name", "attribute": "text" },
            "email": { "selector": ".email", "attribute": "text" },
            "phone": { "selector": ".phone", "attribute": "text" }
          }
        }
      }
    }
  },
  "proxy_config": {
    "enabled": true,
    "type": "rotating",
    "url": "http://proxy.example.com:8080",
    "auth": { "username": "user", "password": "pass" }
  },
  "rate_limit": 10
}
```

#### b) API/JSON Source
```json
{
  "type": "api",
  "url": "https://api.example.com/companies",
  "config": {
    "method": "GET",
    "headers": {
      "Authorization": "Bearer {{api_key}}"
    },
    "pagination": {
      "type": "offset",
      "paramName": "offset",
      "limitParam": "limit",
      "limitValue": 100
    },
    "mapping": {
      "root": "data.companies",
      "fields": {
        "company_name": "name",
        "website": "url",
        "industry": "category",
        "contacts": {
          "path": "people",
          "fields": {
            "name": "fullName",
            "email": "emailAddress"
          }
        }
      }
    }
  }
}
```

#### c) RSS Feed
```json
{
  "type": "rss",
  "url": "https://example.com/companies/feed.xml",
  "config": {
    "mapping": {
      "company_name": "title",
      "website": "link",
      "industry": "category"
    }
  }
}
```

**Rate Limiting:**
- Per-source request limits
- Global concurrent scraper limit
- Automatic backoff on failures
- Respect robots.txt option

**Proxy Support:**
- Single proxy configuration
- Rotating proxy pools
- Proxy authentication
- Per-source proxy assignment

---

### 3. Lead Management (CRM)

**Features:**
- Lead list with filtering, sorting, pagination
- Lead detail view with full history
- Inline editing
- Bulk actions (tag, assign, delete, add to campaign)
- Import/Export (CSV, Excel)
- Duplicate detection & merging
- Lead scoring (configurable rules)

**Lead Statuses:**
- New
- Contacted
- Qualified
- Negotiation
- Converted
- Lost

---

### 4. Communication Channels

#### a) Email
**SMTP Integration:**
- Custom SMTP server support
- TLS/SSL configuration
- Send limits & throttling

**API Providers:**
- Mailchimp/Mandrill
- SendGrid
- SalesHandy
- Amazon SES

**Features:**
- HTML & plain text emails
- Attachments
- Open tracking (pixel)
- Click tracking (link rewriting)
- Unsubscribe handling
- Bounce processing (webhook)

#### b) SMS (Twilio)
- Send SMS messages
- Receive replies (webhook)
- Delivery status tracking
- Short link support

#### c) WhatsApp Web (Unofficial)
- Uses whatsapp-web.js library
- QR code authentication
- Send text & media
- Receive messages
- Session persistence

#### d) WhatsApp Business API (Official)
- Cloud API integration
- Template messages (approved)
- Session messages
- Media support
- Read receipts

#### e) Telegram
- Bot API integration
- Send messages
- Receive messages
- Inline keyboards
- Media support

#### f) Voice (Twilio)
- Click-to-call
- Call logging
- Recording (optional)
- Voicemail detection

---

### 5. Campaign Management

**Campaign Types:**
1. **Immediate**: Send now to selected leads
2. **Scheduled**: Send at specific date/time
3. **Sequence**: Multi-step drip campaign

**Sequence Example:**
```
Step 1: Email (Day 0)
    ↓ (wait 3 days)
Step 2: Follow-up Email (Day 3)
    ↓ (wait 2 days, if no reply)
Step 3: SMS (Day 5)
    ↓ (wait 5 days, if no reply)
Step 4: WhatsApp (Day 10)
```

**Features:**
- Target leads by filter criteria
- Template selection per step
- Variable substitution: `{{lead.company_name}}`, `{{contact.name}}`, etc.
- Pause/resume campaigns
- Skip step if replied
- Exclude from campaign on unsubscribe
- Campaign analytics

---

### 6. Templates

**Variable System:**
```
Lead Variables:
- {{lead.company_name}}
- {{lead.website}}
- {{lead.industry}}
- {{lead.size}}

Contact Variables:
- {{contact.name}}
- {{contact.email}}
- {{contact.phone}}
- {{contact.position}}

System Variables:
- {{unsubscribe_link}}
- {{current_date}}
- {{sender.name}}
- {{sender.email}}
```

**Template Types:**
- Email (subject + HTML body)
- SMS (plain text, 160 char segments)
- WhatsApp (text + optional media)
- Telegram (text + optional media)

---

### 7. Contact Attempts & Conversations

**Tracking:**
- Every outbound attempt logged
- Delivery status updates
- Open/click tracking (email)
- Read receipts (WhatsApp, Telegram)
- Reply detection

**Conversation View:**
- Unified inbox per lead
- Thread view by channel
- Quick reply
- Internal notes
- Assignment to users

---

### 8. Analytics

**Metrics Tracked:**
- Emails: sent, delivered, opened, clicked, replied, bounced
- SMS: sent, delivered, replied
- WhatsApp: sent, delivered, read, replied
- Campaigns: conversion rates per step

**Reports:**
- Channel performance
- Campaign performance
- User activity
- Lead source effectiveness

---

## API Endpoints

### Authentication
```
POST   /api/auth/register          - Tenant self-registration
POST   /api/auth/login             - Login
POST   /api/auth/refresh           - Refresh token
POST   /api/auth/forgot-password   - Request reset
POST   /api/auth/reset-password    - Reset password
GET    /api/auth/me                - Current user
```

### Tenants (Super Admin)
```
GET    /api/admin/tenants          - List tenants
POST   /api/admin/tenants          - Create tenant
GET    /api/admin/tenants/:id      - Get tenant
PATCH  /api/admin/tenants/:id      - Update tenant
DELETE /api/admin/tenants/:id      - Delete tenant
```

### Users
```
GET    /api/users                  - List users
POST   /api/users                  - Create user
GET    /api/users/:id              - Get user
PATCH  /api/users/:id              - Update user
DELETE /api/users/:id              - Delete user
```

### Leads
```
GET    /api/leads                  - List leads (filterable)
POST   /api/leads                  - Create lead
GET    /api/leads/:id              - Get lead with contacts
PATCH  /api/leads/:id              - Update lead
DELETE /api/leads/:id              - Delete lead
POST   /api/leads/import           - Bulk import
GET    /api/leads/export           - Export leads
POST   /api/leads/bulk             - Bulk actions
```

### Contacts
```
GET    /api/leads/:leadId/contacts     - List contacts
POST   /api/leads/:leadId/contacts     - Add contact
PATCH  /api/contacts/:id               - Update contact
DELETE /api/contacts/:id               - Delete contact
```

### Data Sources
```
GET    /api/data-sources               - List sources
POST   /api/data-sources               - Create source
GET    /api/data-sources/:id           - Get source
PATCH  /api/data-sources/:id           - Update source
DELETE /api/data-sources/:id           - Delete source
POST   /api/data-sources/:id/run       - Trigger run
GET    /api/data-sources/:id/runs      - Get run history
POST   /api/data-sources/test          - Test scraper config
```

### Channel Configs
```
GET    /api/channels                   - List channel configs
POST   /api/channels                   - Create channel config
GET    /api/channels/:id               - Get channel config
PATCH  /api/channels/:id               - Update channel config
DELETE /api/channels/:id               - Delete channel config
POST   /api/channels/:id/test          - Test channel
```

### Templates
```
GET    /api/templates                  - List templates
POST   /api/templates                  - Create template
GET    /api/templates/:id              - Get template
PATCH  /api/templates/:id              - Update template
DELETE /api/templates/:id              - Delete template
POST   /api/templates/:id/preview      - Preview with data
```

### Campaigns
```
GET    /api/campaigns                  - List campaigns
POST   /api/campaigns                  - Create campaign
GET    /api/campaigns/:id              - Get campaign
PATCH  /api/campaigns/:id              - Update campaign
DELETE /api/campaigns/:id              - Delete campaign
POST   /api/campaigns/:id/start        - Start campaign
POST   /api/campaigns/:id/pause        - Pause campaign
POST   /api/campaigns/:id/resume       - Resume campaign
GET    /api/campaigns/:id/recipients   - Get recipients
GET    /api/campaigns/:id/analytics    - Get analytics
```

### Contact Attempts & Conversations
```
GET    /api/leads/:id/attempts         - Get attempts for lead
GET    /api/leads/:id/conversations    - Get conversations
GET    /api/conversations/:id/messages - Get messages
POST   /api/conversations/:id/messages - Send reply
```

### Analytics
```
GET    /api/analytics/overview         - Dashboard overview
GET    /api/analytics/channels         - Channel performance
GET    /api/analytics/campaigns        - Campaign performance
GET    /api/analytics/sources          - Source effectiveness
```

### Webhooks (for external services)
```
POST   /api/webhooks/email/:provider   - Email events
POST   /api/webhooks/twilio            - Twilio events
POST   /api/webhooks/whatsapp          - WhatsApp events
POST   /api/webhooks/telegram          - Telegram events
```

---

## Project Structure

```
salesbook/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── README.md
│
├── client/                          # React Frontend
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── common/              # Buttons, Modals, Tables, etc.
│   │   │   ├── layout/              # Navbar, Sidebar, Footer
│   │   │   ├── auth/
│   │   │   ├── leads/
│   │   │   ├── campaigns/
│   │   │   ├── templates/
│   │   │   ├── channels/
│   │   │   ├── data-sources/
│   │   │   ├── conversations/
│   │   │   └── analytics/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/                # API client
│   │   ├── store/                   # State management (Context/Redux)
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                          # Node.js Backend
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   ├── jwt.js
│   │   │   └── index.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── tenant.js
│   │   │   ├── rbac.js
│   │   │   ├── validation.js
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── users.js
│   │   │   ├── leads.js
│   │   │   ├── contacts.js
│   │   │   ├── dataSources.js
│   │   │   ├── channels.js
│   │   │   ├── templates.js
│   │   │   ├── campaigns.js
│   │   │   ├── conversations.js
│   │   │   ├── analytics.js
│   │   │   ├── webhooks.js
│   │   │   └── admin.js
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── auth.service.js
│   │   │   ├── lead.service.js
│   │   │   ├── scraper.service.js
│   │   │   ├── campaign.service.js
│   │   │   ├── email.service.js
│   │   │   ├── sms.service.js
│   │   │   ├── whatsapp.service.js
│   │   │   ├── telegram.service.js
│   │   │   ├── voice.service.js
│   │   │   └── analytics.service.js
│   │   ├── jobs/
│   │   │   ├── queue.js             # Job queue implementation
│   │   │   ├── scheduler.js         # Cron scheduler
│   │   │   ├── scraper.worker.js
│   │   │   ├── campaign.worker.js
│   │   │   └── poller.worker.js
│   │   ├── scrapers/
│   │   │   ├── playwright.scraper.js
│   │   │   ├── api.scraper.js
│   │   │   └── rss.scraper.js
│   │   ├── utils/
│   │   │   ├── encryption.js
│   │   │   ├── templateEngine.js
│   │   │   └── validators.js
│   │   └── app.js
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── storage/                     # Local file storage
│   │   ├── attachments/
│   │   ├── exports/
│   │   └── scripts/
│   ├── package.json
│   └── .env
│
└── docs/
    ├── API.md
    ├── DEPLOYMENT.md
    └── SCRAPER_CONFIG.md
```

---

## Implementation Phases

### Phase 1: Foundation (Core Infrastructure)
- [ ] Project setup (monorepo structure)
- [ ] Database schema & Prisma setup
- [ ] Authentication system (JWT, registration, login)
- [ ] Multi-tenancy middleware
- [ ] RBAC implementation
- [ ] Basic React app with routing
- [ ] User management UI

### Phase 2: Lead Management
- [ ] Lead CRUD operations
- [ ] Contact management
- [ ] Lead list with filters/search
- [ ] Lead detail view
- [ ] Import/Export functionality
- [ ] Bulk actions

### Phase 3: Data Sources
- [ ] Data source CRUD
- [ ] Playwright scraper engine
- [ ] API/JSON source handler
- [ ] RSS source handler
- [ ] Job queue implementation
- [ ] Scheduled polling
- [ ] Rate limiting & proxy support
- [ ] Scraper configuration UI

### Phase 4: Communication Channels
- [ ] Email - SMTP integration
- [ ] Email - Mailchimp/Mandrill API
- [ ] SMS - Twilio integration
- [ ] WhatsApp Web integration
- [ ] WhatsApp Business API
- [ ] Telegram Bot integration
- [ ] Voice - Twilio integration
- [ ] Channel configuration UI

### Phase 5: Templates & Campaigns
- [ ] Template CRUD & editor
- [ ] Variable substitution engine
- [ ] Campaign creation wizard
- [ ] Sequence builder
- [ ] Campaign execution engine
- [ ] Campaign management UI

### Phase 6: Conversations & Tracking
- [ ] Contact attempt logging
- [ ] Webhook handlers
- [ ] Conversation threading
- [ ] Unified inbox UI
- [ ] Reply functionality

### Phase 7: Analytics & Polish
- [ ] Analytics aggregation
- [ ] Dashboard UI
- [ ] Reports
- [ ] Performance optimization
- [ ] Documentation

---

## Environment Variables

```env
# Application
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
CLIENT_URL=http://localhost:5173

# Database
DATABASE_URL=mysql://user:password@localhost:3306/salesbook

# JWT
JWT_SECRET=your-super-secret-key
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

# File Storage
STORAGE_PATH=./storage

# Email - SMTP (optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@example.com

# Email - Mailchimp/Mandrill (optional)
MANDRILL_API_KEY=

# Twilio (optional)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# WhatsApp Business API (optional)
WHATSAPP_API_URL=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=

# Telegram (optional)
TELEGRAM_BOT_TOKEN=

# Encryption
ENCRYPTION_KEY=32-byte-encryption-key-here
```

---

## Running the Application

### Without Docker

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Setup database
cd ../server
cp .env.example .env
# Edit .env with your MySQL credentials
npx prisma migrate dev
npx prisma db seed  # Optional: seed with sample data

# Start backend
npm run dev

# Start frontend (new terminal)
cd ../client
npm run dev
```

### With Docker

```bash
# Copy environment file
cp .env.example .env
# Edit .env as needed

# Start all services
docker-compose up -d

# Run migrations
docker-compose exec server npx prisma migrate deploy
```

---

## Security Considerations

1. **Data Encryption**: Sensitive data (API keys, credentials) encrypted at rest
2. **Input Validation**: All inputs validated and sanitized
3. **SQL Injection**: Prevented via Prisma ORM
4. **XSS Protection**: React escapes by default + CSP headers
5. **CSRF Protection**: JWT in httpOnly cookies or Authorization header
6. **Rate Limiting**: API rate limiting per tenant
7. **Audit Logging**: Track sensitive operations
8. **Tenant Isolation**: All queries scoped by tenant_id

---

## Future Enhancements (Post-MVP)

- [ ] Visual scraper builder (point-and-click)
- [ ] A/B testing for campaigns
- [ ] Lead scoring with ML
- [ ] Advanced analytics dashboard
- [ ] Mobile app (React Native)
- [ ] API for external integrations
- [ ] Zapier/n8n integration
- [ ] Custom workflow automation
- [ ] Team collaboration features
- [ ] White-labeling support
