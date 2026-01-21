# SalesBook API Reference

Base URL: `http://localhost:3000/api/v1`

## Table of Contents

1. [Authentication](#authentication)
2. [Response Format](#response-format)
3. [Pagination](#pagination)
4. [Error Codes](#error-codes)
5. [Endpoints](#endpoints)
   - [Auth](#auth)
   - [Users](#users)
   - [Tenants (Admin)](#tenants-admin)
   - [Leads](#leads)
   - [Contacts](#contacts)
   - [Data Sources](#data-sources)
   - [Channel Configs](#channel-configs)
   - [Templates](#templates)
   - [Campaigns](#campaigns)
   - [Conversations](#conversations)
   - [Analytics](#analytics)
   - [Webhooks](#webhooks)

---

## Authentication

All authenticated endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### Obtaining a Token

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 3600,
    "user": {
      "id": 1,
      "email": "user@example.com",
      "name": "John Doe",
      "role": "tenant_admin",
      "tenantId": 1
    }
  }
}
```

### Refreshing a Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Email is required"
      }
    ]
  }
}
```

---

## Pagination

List endpoints support pagination via query parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | 1 | Page number |
| `limit` | 20 | Items per page (max 100) |
| `sort` | created_at | Sort field |
| `order` | desc | Sort order (asc/desc) |

Example:
```
GET /leads?page=2&limit=50&sort=company_name&order=asc
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Endpoints

### Auth

#### Register (Tenant Self-Registration)

```http
POST /auth/register
```

Request:
```json
{
  "email": "admin@company.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "companyName": "Acme Inc"
}
```

Response: Same as login

---

#### Login

```http
POST /auth/login
```

Request:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

---

#### Refresh Token

```http
POST /auth/refresh
```

Request:
```json
{
  "refreshToken": "..."
}
```

---

#### Forgot Password

```http
POST /auth/forgot-password
```

Request:
```json
{
  "email": "user@example.com"
}
```

---

#### Reset Password

```http
POST /auth/reset-password
```

Request:
```json
{
  "token": "reset-token-from-email",
  "password": "NewSecurePass123!"
}
```

---

#### Get Current User

```http
GET /auth/me
Authorization: Bearer <token>
```

---

### Users

#### List Users

```http
GET /users
Authorization: Bearer <token>
```

Query Parameters:
- `role` - Filter by role
- `status` - Filter by status (active/inactive)
- `search` - Search by name or email

---

#### Create User

```http
POST /users
Authorization: Bearer <token>
```

Request:
```json
{
  "email": "newuser@example.com",
  "password": "TempPass123!",
  "name": "Jane Smith",
  "role": "sales_rep"
}
```

Required role: `tenant_admin` or higher

---

#### Get User

```http
GET /users/:id
Authorization: Bearer <token>
```

---

#### Update User

```http
PATCH /users/:id
Authorization: Bearer <token>
```

Request:
```json
{
  "name": "Jane Smith Updated",
  "role": "manager",
  "status": "active"
}
```

---

#### Delete User

```http
DELETE /users/:id
Authorization: Bearer <token>
```

---

### Tenants (Admin)

Super admin only endpoints.

#### List Tenants

```http
GET /admin/tenants
Authorization: Bearer <token>
```

---

#### Create Tenant

```http
POST /admin/tenants
Authorization: Bearer <token>
```

Request:
```json
{
  "name": "New Company",
  "slug": "new-company",
  "adminEmail": "admin@newcompany.com",
  "adminName": "Admin User",
  "adminPassword": "SecurePass123!"
}
```

---

#### Get Tenant

```http
GET /admin/tenants/:id
Authorization: Bearer <token>
```

---

#### Update Tenant

```http
PATCH /admin/tenants/:id
Authorization: Bearer <token>
```

Request:
```json
{
  "name": "Updated Company Name",
  "status": "active",
  "settings": {
    "maxUsers": 50,
    "features": ["campaigns", "scraping"]
  }
}
```

---

#### Delete Tenant

```http
DELETE /admin/tenants/:id
Authorization: Bearer <token>
```

---

### Leads

#### List Leads

```http
GET /leads
Authorization: Bearer <token>
```

Query Parameters:
- `search` - Search company name, website, contact emails
- `status` - Filter by status (comma-separated)
- `industry` - Filter by industry (comma-separated)
- `size` - Filter by size (comma-separated)
- `source_id` - Filter by data source
- `tags` - Filter by tags (comma-separated)
- `created_after` - ISO date
- `created_before` - ISO date
- `assigned_to` - User ID

Example:
```
GET /leads?status=new,contacted&industry=Technology&page=1&limit=50
```

---

#### Create Lead

```http
POST /leads
Authorization: Bearer <token>
```

Request:
```json
{
  "company_name": "Tech Corp",
  "website": "https://techcorp.com",
  "industry": "Technology",
  "size": "medium",
  "status": "new",
  "tags": ["hot-lead", "enterprise"],
  "contacts": [
    {
      "name": "John Doe",
      "email": "john@techcorp.com",
      "phone": "+1234567890",
      "position": "CEO",
      "is_primary": true
    }
  ]
}
```

---

#### Get Lead

```http
GET /leads/:id
Authorization: Bearer <token>
```

Response includes contacts and recent activity.

---

#### Update Lead

```http
PATCH /leads/:id
Authorization: Bearer <token>
```

Request:
```json
{
  "status": "contacted",
  "tags": ["hot-lead", "enterprise", "follow-up"]
}
```

---

#### Delete Lead

```http
DELETE /leads/:id
Authorization: Bearer <token>
```

---

#### Bulk Actions

```http
POST /leads/bulk
Authorization: Bearer <token>
```

Request:
```json
{
  "action": "update_status",
  "lead_ids": [1, 2, 3, 4, 5],
  "data": {
    "status": "qualified"
  }
}
```

Supported actions:
- `update_status` - Change status
- `add_tags` - Add tags
- `remove_tags` - Remove tags
- `assign` - Assign to user
- `delete` - Delete leads
- `add_to_campaign` - Add to campaign

---

#### Import Leads

```http
POST /leads/import
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

Form fields:
- `file` - CSV or Excel file
- `mapping` - JSON field mapping
- `duplicate_action` - skip/update/create

---

#### Export Leads

```http
GET /leads/export
Authorization: Bearer <token>
```

Query Parameters:
- `format` - csv or xlsx
- Same filters as list endpoint

Returns file download.

---

### Contacts

#### List Contacts for Lead

```http
GET /leads/:leadId/contacts
Authorization: Bearer <token>
```

---

#### Add Contact to Lead

```http
POST /leads/:leadId/contacts
Authorization: Bearer <token>
```

Request:
```json
{
  "name": "Jane Smith",
  "email": "jane@company.com",
  "phone": "+1234567890",
  "position": "CTO",
  "is_primary": false
}
```

---

#### Update Contact

```http
PATCH /contacts/:id
Authorization: Bearer <token>
```

---

#### Delete Contact

```http
DELETE /contacts/:id
Authorization: Bearer <token>
```

---

### Data Sources

#### List Data Sources

```http
GET /data-sources
Authorization: Bearer <token>
```

---

#### Create Data Source

```http
POST /data-sources
Authorization: Bearer <token>
```

Request (Playwright):
```json
{
  "name": "Company Directory",
  "type": "playwright",
  "url": "https://directory.example.com",
  "config": {
    "browser": "chromium",
    "headless": true,
    "extraction": {
      "containerSelector": ".company-card",
      "fields": {
        "company_name": { "selector": ".name", "attribute": "text" },
        "website": { "selector": "a.website", "attribute": "href" }
      }
    }
  },
  "rate_limit": 10,
  "polling_frequency": "0 0 * * *"
}
```

Request (API):
```json
{
  "name": "CRM API",
  "type": "api",
  "url": "https://api.example.com/companies",
  "config": {
    "method": "GET",
    "headers": {
      "Authorization": "Bearer {{api_key}}"
    },
    "mapping": {
      "root": "data",
      "fields": {
        "company_name": "name",
        "website": "url"
      }
    }
  },
  "polling_frequency": "*/30 * * * *"
}
```

See [SCRAPER_CONFIG.md](SCRAPER_CONFIG.md) for full configuration options.

---

#### Get Data Source

```http
GET /data-sources/:id
Authorization: Bearer <token>
```

---

#### Update Data Source

```http
PATCH /data-sources/:id
Authorization: Bearer <token>
```

---

#### Delete Data Source

```http
DELETE /data-sources/:id
Authorization: Bearer <token>
```

---

#### Trigger Manual Run

```http
POST /data-sources/:id/run
Authorization: Bearer <token>
```

---

#### Get Run History

```http
GET /data-sources/:id/runs
Authorization: Bearer <token>
```

---

#### Test Configuration

```http
POST /data-sources/test
Authorization: Bearer <token>
```

Tests the configuration and returns sample results without saving leads.

---

### Channel Configs

#### List Channel Configs

```http
GET /channels
Authorization: Bearer <token>
```

---

#### Create Channel Config

```http
POST /channels
Authorization: Bearer <token>
```

Request (SMTP):
```json
{
  "name": "Main Email",
  "channel_type": "email_smtp",
  "provider": "smtp",
  "credentials": {
    "host": "smtp.example.com",
    "port": 587,
    "secure": false,
    "user": "user@example.com",
    "pass": "password"
  },
  "settings": {
    "from_name": "Sales Team",
    "from_email": "sales@example.com",
    "daily_limit": 500
  }
}
```

Request (Twilio):
```json
{
  "name": "SMS Channel",
  "channel_type": "sms",
  "provider": "twilio",
  "credentials": {
    "account_sid": "AC...",
    "auth_token": "...",
    "phone_number": "+1234567890"
  },
  "settings": {
    "daily_limit": 1000
  }
}
```

---

#### Test Channel

```http
POST /channels/:id/test
Authorization: Bearer <token>
```

Request:
```json
{
  "recipient": "test@example.com",
  "message": "Test message"
}
```

---

### Templates

#### List Templates

```http
GET /templates
Authorization: Bearer <token>
```

Query Parameters:
- `channel_type` - Filter by channel type

---

#### Create Template

```http
POST /templates
Authorization: Bearer <token>
```

Request (Email):
```json
{
  "name": "Introduction Email",
  "channel_type": "email",
  "subject": "Hello from {{sender.name}} at {{sender.company}}",
  "body": "<p>Hi {{contact.name}},</p><p>I noticed {{lead.company_name}} is in the {{lead.industry}} space...</p><p>{{unsubscribe_link}}</p>"
}
```

Request (SMS):
```json
{
  "name": "Follow-up SMS",
  "channel_type": "sms",
  "body": "Hi {{contact.name}}, following up on my email about {{lead.company_name}}. Would you have 15 mins this week?"
}
```

---

#### Preview Template

```http
POST /templates/:id/preview
Authorization: Bearer <token>
```

Request:
```json
{
  "lead_id": 123,
  "contact_id": 456
}
```

Returns rendered template with variables replaced.

---

### Campaigns

#### List Campaigns

```http
GET /campaigns
Authorization: Bearer <token>
```

Query Parameters:
- `status` - Filter by status (draft/active/paused/completed)

---

#### Create Campaign

```http
POST /campaigns
Authorization: Bearer <token>
```

Request (Immediate):
```json
{
  "name": "Q1 Outreach",
  "type": "immediate",
  "target_filter": {
    "status": ["new"],
    "industry": ["Technology", "Finance"]
  },
  "steps": [
    {
      "step_order": 1,
      "channel_type": "email",
      "channel_config_id": 1,
      "template_id": 1
    }
  ]
}
```

Request (Sequence):
```json
{
  "name": "Multi-touch Campaign",
  "type": "sequence",
  "target_filter": {
    "tags": ["hot-lead"]
  },
  "steps": [
    {
      "step_order": 1,
      "channel_type": "email",
      "channel_config_id": 1,
      "template_id": 1,
      "delay_days": 0,
      "delay_hours": 0
    },
    {
      "step_order": 2,
      "channel_type": "email",
      "channel_config_id": 1,
      "template_id": 2,
      "delay_days": 3,
      "delay_hours": 0
    },
    {
      "step_order": 3,
      "channel_type": "sms",
      "channel_config_id": 2,
      "template_id": 3,
      "delay_days": 2,
      "delay_hours": 0
    }
  ]
}
```

---

#### Get Campaign

```http
GET /campaigns/:id
Authorization: Bearer <token>
```

---

#### Start Campaign

```http
POST /campaigns/:id/start
Authorization: Bearer <token>
```

---

#### Pause Campaign

```http
POST /campaigns/:id/pause
Authorization: Bearer <token>
```

---

#### Resume Campaign

```http
POST /campaigns/:id/resume
Authorization: Bearer <token>
```

---

#### Get Campaign Recipients

```http
GET /campaigns/:id/recipients
Authorization: Bearer <token>
```

Query Parameters:
- `status` - Filter by recipient status

---

#### Get Campaign Analytics

```http
GET /campaigns/:id/analytics
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "total_recipients": 500,
    "by_status": {
      "completed": 350,
      "in_progress": 100,
      "pending": 30,
      "failed": 20
    },
    "by_step": [
      {
        "step": 1,
        "sent": 500,
        "delivered": 480,
        "opened": 200,
        "clicked": 50,
        "replied": 25
      }
    ]
  }
}
```

---

### Conversations

#### Get Conversations for Lead

```http
GET /leads/:id/conversations
Authorization: Bearer <token>
```

---

#### Get Messages in Conversation

```http
GET /conversations/:id/messages
Authorization: Bearer <token>
```

---

#### Send Reply

```http
POST /conversations/:id/messages
Authorization: Bearer <token>
```

Request:
```json
{
  "content": "Thanks for your reply! Let me schedule a call...",
  "channel_config_id": 1
}
```

---

### Analytics

#### Overview Dashboard

```http
GET /analytics/overview
Authorization: Bearer <token>
```

Query Parameters:
- `period` - day/week/month/year

---

#### Channel Performance

```http
GET /analytics/channels
Authorization: Bearer <token>
```

Query Parameters:
- `start_date` - ISO date
- `end_date` - ISO date
- `channel_type` - Filter by channel

---

#### Campaign Performance

```http
GET /analytics/campaigns
Authorization: Bearer <token>
```

---

#### Source Effectiveness

```http
GET /analytics/sources
Authorization: Bearer <token>
```

---

### Webhooks

Webhook endpoints for external services to send delivery updates.

#### Email Provider Webhooks

```http
POST /webhooks/email/:provider
```

Supported providers: `mailchimp`, `mandrill`, `sendgrid`, `ses`

#### Twilio Webhooks

```http
POST /webhooks/twilio
```

Handles SMS delivery status and incoming messages.

#### WhatsApp Webhooks

```http
POST /webhooks/whatsapp
```

#### Telegram Webhooks

```http
POST /webhooks/telegram
```

---

## Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| Authentication | 5 requests/minute |
| General API | 100 requests/minute |
| Bulk operations | 10 requests/minute |
| File uploads | 5 requests/minute |

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1609459200
```
