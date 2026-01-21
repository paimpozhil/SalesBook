# SalesBook Scraper Configuration Guide

This guide explains how to configure data sources for collecting leads from various sources.

## Table of Contents

1. [Overview](#overview)
2. [Source Types](#source-types)
3. [Playwright Scraper](#playwright-scraper)
4. [API/JSON Source](#apijson-source)
5. [RSS Feed Source](#rss-feed-source)
6. [Proxy Configuration](#proxy-configuration)
7. [Rate Limiting](#rate-limiting)
8. [Scheduling](#scheduling)
9. [Field Mapping](#field-mapping)
10. [Examples](#examples)

---

## Overview

Data sources allow SalesBook to automatically collect leads from:
- **Websites** - Using Playwright for browser automation
- **APIs** - REST APIs returning JSON data
- **RSS Feeds** - Standard RSS/Atom feeds

Each source is configured with:
- Connection details (URL, authentication)
- Extraction rules (selectors, field mapping)
- Rate limiting and proxy settings
- Polling schedule

---

## Source Types

| Type | Use Case | Complexity |
|------|----------|------------|
| `playwright` | Websites requiring JavaScript, login, pagination | High |
| `api` | REST APIs, JSON endpoints | Medium |
| `rss` | Blog feeds, news sources, company directories | Low |

---

## Playwright Scraper

The most powerful option for scraping websites that require browser rendering.

### Basic Structure

```json
{
  "type": "playwright",
  "url": "https://example.com/directory",
  "config": {
    "browser": "chromium",
    "headless": true,
    "viewport": { "width": 1920, "height": 1080 },
    "timeout": 30000,
    "auth": { ... },
    "beforeExtract": [ ... ],
    "pagination": { ... },
    "extraction": { ... }
  }
}
```

### Browser Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `browser` | chromium, firefox, webkit | chromium | Browser engine |
| `headless` | true, false | true | Run without visible browser |
| `viewport` | { width, height } | 1920x1080 | Browser window size |
| `timeout` | number (ms) | 30000 | Page load timeout |
| `userAgent` | string | default | Custom user agent |

### Authentication

#### Form-based Login

```json
{
  "auth": {
    "type": "form",
    "loginUrl": "https://example.com/login",
    "steps": [
      { "action": "fill", "selector": "#email", "value": "{{username}}" },
      { "action": "fill", "selector": "#password", "value": "{{password}}" },
      { "action": "click", "selector": "button[type=submit]" },
      { "action": "waitForNavigation" }
    ],
    "credentials": {
      "username": "user@example.com",
      "password": "encrypted_password"
    },
    "successCheck": {
      "selector": ".dashboard",
      "exists": true
    }
  }
}
```

#### Cookie-based Session

```json
{
  "auth": {
    "type": "cookies",
    "cookies": [
      {
        "name": "session_id",
        "value": "abc123",
        "domain": "example.com"
      }
    ]
  }
}
```

#### HTTP Headers

```json
{
  "auth": {
    "type": "headers",
    "headers": {
      "Authorization": "Bearer {{api_token}}",
      "X-API-Key": "{{api_key}}"
    }
  }
}
```

### Action Steps

Available actions for `beforeExtract` and `auth.steps`:

| Action | Parameters | Description |
|--------|------------|-------------|
| `goto` | `url` | Navigate to URL |
| `click` | `selector` | Click element |
| `fill` | `selector`, `value` | Fill input field |
| `select` | `selector`, `value` | Select dropdown option |
| `check` | `selector` | Check checkbox |
| `uncheck` | `selector` | Uncheck checkbox |
| `hover` | `selector` | Hover over element |
| `scroll` | `direction`, `amount` | Scroll page |
| `wait` | `duration` (ms) | Wait fixed time |
| `waitForSelector` | `selector`, `state` | Wait for element |
| `waitForNavigation` | - | Wait for page load |
| `screenshot` | `name` | Take screenshot (debugging) |
| `evaluate` | `script` | Run custom JavaScript |

Example:
```json
{
  "beforeExtract": [
    { "action": "click", "selector": ".load-more" },
    { "action": "wait", "duration": 2000 },
    { "action": "scroll", "direction": "down", "amount": 500 },
    { "action": "waitForSelector", "selector": ".company-card", "state": "visible" }
  ]
}
```

### Pagination

#### Click-based (Load More / Next)

```json
{
  "pagination": {
    "type": "click",
    "nextSelector": "button.next-page",
    "maxPages": 10,
    "waitAfterClick": 2000,
    "stopWhen": {
      "selector": ".next-page",
      "state": "hidden"
    }
  }
}
```

#### Infinite Scroll

```json
{
  "pagination": {
    "type": "scroll",
    "scrollAmount": 1000,
    "maxScrolls": 20,
    "waitAfterScroll": 1500,
    "stopWhen": {
      "noNewContent": true,
      "selector": ".end-of-list"
    }
  }
}
```

#### URL-based

```json
{
  "pagination": {
    "type": "url",
    "pattern": "https://example.com/companies?page={{page}}",
    "startPage": 1,
    "maxPages": 50,
    "increment": 1
  }
}
```

### Extraction

#### Single-level Extraction

```json
{
  "extraction": {
    "containerSelector": ".company-card",
    "fields": {
      "company_name": {
        "selector": ".company-name",
        "attribute": "text"
      },
      "website": {
        "selector": "a.website-link",
        "attribute": "href"
      },
      "industry": {
        "selector": ".industry-tag",
        "attribute": "text"
      },
      "size": {
        "selector": ".employee-count",
        "attribute": "text",
        "transform": "extractNumber"
      },
      "logo": {
        "selector": "img.logo",
        "attribute": "src"
      }
    }
  }
}
```

#### Nested Extraction (Contacts)

```json
{
  "extraction": {
    "containerSelector": ".company-card",
    "fields": {
      "company_name": { "selector": ".name", "attribute": "text" },
      "contacts": {
        "selector": ".contact-person",
        "multiple": true,
        "fields": {
          "name": { "selector": ".contact-name", "attribute": "text" },
          "email": { "selector": ".contact-email", "attribute": "text" },
          "phone": { "selector": ".contact-phone", "attribute": "text" },
          "position": { "selector": ".contact-title", "attribute": "text" }
        }
      }
    }
  }
}
```

#### Attribute Options

| Attribute | Description |
|-----------|-------------|
| `text` | Inner text content |
| `html` | Inner HTML |
| `href` | Link URL |
| `src` | Image/media source |
| `value` | Form input value |
| `data-*` | Any data attribute |
| Custom | Any HTML attribute |

#### Transforms

| Transform | Description | Example |
|-----------|-------------|---------|
| `trim` | Remove whitespace | "  hello  " → "hello" |
| `lowercase` | Convert to lowercase | "HELLO" → "hello" |
| `uppercase` | Convert to uppercase | "hello" → "HELLO" |
| `extractNumber` | Extract first number | "500 employees" → 500 |
| `extractEmail` | Extract email address | "Contact: a@b.com" → "a@b.com" |
| `extractPhone` | Extract phone number | "Call +1-234-567" → "+1234567" |
| `removeHtml` | Strip HTML tags | "&lt;b&gt;text&lt;/b&gt;" → "text" |
| `regex` | Custom regex extraction | See below |

Regex transform:
```json
{
  "selector": ".info",
  "attribute": "text",
  "transform": {
    "type": "regex",
    "pattern": "Revenue: \\$([\\d,]+)",
    "group": 1
  }
}
```

---

## API/JSON Source

For REST APIs that return JSON data.

### Basic Structure

```json
{
  "type": "api",
  "url": "https://api.example.com/companies",
  "config": {
    "method": "GET",
    "headers": { ... },
    "body": { ... },
    "pagination": { ... },
    "mapping": { ... }
  }
}
```

### Request Configuration

```json
{
  "config": {
    "method": "GET",
    "headers": {
      "Authorization": "Bearer {{api_key}}",
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    "queryParams": {
      "status": "active",
      "limit": 100
    }
  }
}
```

For POST requests:
```json
{
  "config": {
    "method": "POST",
    "headers": {
      "Authorization": "Bearer {{api_key}}",
      "Content-Type": "application/json"
    },
    "body": {
      "filters": {
        "industry": "Technology"
      },
      "limit": 100
    }
  }
}
```

### API Pagination

#### Offset-based

```json
{
  "pagination": {
    "type": "offset",
    "offsetParam": "offset",
    "limitParam": "limit",
    "limitValue": 100,
    "maxRecords": 10000
  }
}
```

#### Page-based

```json
{
  "pagination": {
    "type": "page",
    "pageParam": "page",
    "limitParam": "per_page",
    "limitValue": 50,
    "maxPages": 100
  }
}
```

#### Cursor-based

```json
{
  "pagination": {
    "type": "cursor",
    "cursorParam": "cursor",
    "cursorPath": "meta.next_cursor",
    "hasMorePath": "meta.has_more"
  }
}
```

#### Link Header (RFC 5988)

```json
{
  "pagination": {
    "type": "link_header"
  }
}
```

### Response Mapping

```json
{
  "mapping": {
    "root": "data.companies",
    "fields": {
      "company_name": "name",
      "website": "homepage_url",
      "industry": "category.name",
      "size": "employee_count",
      "contacts": {
        "path": "people",
        "fields": {
          "name": "full_name",
          "email": "email_address",
          "phone": "phone_number",
          "position": "job_title"
        }
      }
    }
  }
}
```

Path notation:
- `name` - Simple field
- `category.name` - Nested field
- `addresses[0].city` - Array index
- `tags[*]` - All array elements

---

## RSS Feed Source

For standard RSS or Atom feeds.

### Basic Structure

```json
{
  "type": "rss",
  "url": "https://example.com/companies/feed.xml",
  "config": {
    "mapping": {
      "company_name": "title",
      "website": "link",
      "industry": "category",
      "description": "description"
    }
  }
}
```

### RSS Field Mapping

Standard RSS fields:
- `title` - Item title
- `link` - Item URL
- `description` - Item description/summary
- `pubDate` - Publication date
- `category` - Category/tag
- `author` - Author name
- `guid` - Unique identifier

Custom namespaced fields:
```json
{
  "mapping": {
    "company_name": "title",
    "website": "link",
    "email": "dc:creator",
    "size": "custom:employeeCount"
  }
}
```

---

## Proxy Configuration

### Single Proxy

```json
{
  "proxy_config": {
    "enabled": true,
    "type": "static",
    "url": "http://proxy.example.com:8080",
    "auth": {
      "username": "user",
      "password": "pass"
    }
  }
}
```

### Rotating Proxy

```json
{
  "proxy_config": {
    "enabled": true,
    "type": "rotating",
    "url": "http://rotating.proxy.com:8080",
    "auth": {
      "username": "user",
      "password": "pass"
    },
    "rotationStrategy": "per_request"
  }
}
```

### Proxy Pool

```json
{
  "proxy_config": {
    "enabled": true,
    "type": "pool",
    "proxies": [
      "http://proxy1.example.com:8080",
      "http://proxy2.example.com:8080",
      "http://proxy3.example.com:8080"
    ],
    "rotationStrategy": "round_robin",
    "healthCheck": {
      "enabled": true,
      "interval": 300,
      "timeout": 5000
    }
  }
}
```

Rotation strategies:
- `per_request` - New proxy each request
- `per_page` - New proxy each page
- `round_robin` - Cycle through list
- `random` - Random selection
- `on_error` - Rotate on failure

---

## Rate Limiting

```json
{
  "rate_limit": 10,
  "rate_limit_config": {
    "requests_per_minute": 10,
    "concurrent_requests": 2,
    "delay_between_requests": 1000,
    "backoff": {
      "enabled": true,
      "initial_delay": 5000,
      "max_delay": 60000,
      "multiplier": 2
    },
    "respect_robots_txt": true,
    "retry_on_status": [429, 500, 502, 503, 504],
    "max_retries": 3
  }
}
```

---

## Scheduling

Polling frequency uses cron expressions:

```json
{
  "polling_frequency": "0 0 * * *"
}
```

### Cron Format

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday = 0)
│ │ │ │ │
* * * * *
```

### Common Schedules

| Schedule | Cron Expression |
|----------|-----------------|
| Every hour | `0 * * * *` |
| Every 6 hours | `0 */6 * * *` |
| Daily at midnight | `0 0 * * *` |
| Daily at 9 AM | `0 9 * * *` |
| Every Monday at 9 AM | `0 9 * * 1` |
| First of month | `0 0 1 * *` |
| Every 30 minutes | `*/30 * * * *` |
| Weekdays at 6 AM | `0 6 * * 1-5` |

---

## Field Mapping

### Lead Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `company_name` | string | Yes | Company name |
| `website` | string | No | Company website |
| `industry` | string | No | Industry/category |
| `size` | enum | No | micro/small/medium/large/enterprise |
| `tags` | array | No | Tags for categorization |
| `custom_fields` | object | No | Additional custom data |

### Contact Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No* | Contact name |
| `email` | string | No* | Email address |
| `phone` | string | No* | Phone number |
| `position` | string | No | Job title |
| `is_primary` | boolean | No | Primary contact flag |

*At least one contact field should be provided.

### Size Mapping

If your source uses different terminology:

```json
{
  "size": {
    "selector": ".company-size",
    "attribute": "text",
    "valueMapping": {
      "1-10": "micro",
      "11-50": "small",
      "51-200": "medium",
      "201-1000": "large",
      "1000+": "enterprise"
    }
  }
}
```

---

## Examples

### Example 1: LinkedIn-style Directory

```json
{
  "name": "Business Directory",
  "type": "playwright",
  "url": "https://directory.example.com",
  "config": {
    "browser": "chromium",
    "headless": true,
    "auth": {
      "type": "form",
      "loginUrl": "https://directory.example.com/login",
      "steps": [
        { "action": "fill", "selector": "#email", "value": "{{username}}" },
        { "action": "fill", "selector": "#password", "value": "{{password}}" },
        { "action": "click", "selector": "#login-btn" },
        { "action": "waitForNavigation" }
      ]
    },
    "beforeExtract": [
      { "action": "goto", "url": "https://directory.example.com/companies" },
      { "action": "waitForSelector", "selector": ".company-list" }
    ],
    "pagination": {
      "type": "click",
      "nextSelector": ".pagination .next",
      "maxPages": 50,
      "waitAfterClick": 2000
    },
    "extraction": {
      "containerSelector": ".company-card",
      "fields": {
        "company_name": { "selector": "h3.company-name", "attribute": "text" },
        "website": { "selector": "a.website", "attribute": "href" },
        "industry": { "selector": ".industry-badge", "attribute": "text" },
        "size": {
          "selector": ".employee-count",
          "attribute": "text",
          "transform": "extractNumber",
          "valueMapping": {
            "1-10": "micro",
            "11-50": "small",
            "51-200": "medium",
            "201-1000": "large",
            "default": "enterprise"
          }
        },
        "contacts": {
          "selector": ".contact-item",
          "multiple": true,
          "fields": {
            "name": { "selector": ".name", "attribute": "text" },
            "email": { "selector": ".email", "attribute": "text" },
            "position": { "selector": ".title", "attribute": "text" }
          }
        }
      }
    }
  },
  "proxy_config": {
    "enabled": true,
    "type": "rotating",
    "url": "http://proxy.example.com:8080"
  },
  "rate_limit": 5,
  "polling_frequency": "0 0 * * 1"
}
```

### Example 2: CRM API Integration

```json
{
  "name": "HubSpot Companies",
  "type": "api",
  "url": "https://api.hubapi.com/crm/v3/objects/companies",
  "config": {
    "method": "GET",
    "headers": {
      "Authorization": "Bearer {{hubspot_api_key}}"
    },
    "queryParams": {
      "limit": 100,
      "properties": "name,domain,industry,numberofemployees"
    },
    "pagination": {
      "type": "cursor",
      "cursorParam": "after",
      "cursorPath": "paging.next.after",
      "hasMorePath": "paging.next"
    },
    "mapping": {
      "root": "results",
      "fields": {
        "company_name": "properties.name",
        "website": "properties.domain",
        "industry": "properties.industry",
        "size": {
          "path": "properties.numberofemployees",
          "valueMapping": {
            "1-10": "micro",
            "11-50": "small",
            "51-200": "medium",
            "201-1000": "large",
            "default": "enterprise"
          }
        }
      }
    }
  },
  "rate_limit": 100,
  "polling_frequency": "0 */4 * * *"
}
```

### Example 3: Company News RSS

```json
{
  "name": "TechCrunch Startups",
  "type": "rss",
  "url": "https://techcrunch.com/category/startups/feed/",
  "config": {
    "mapping": {
      "company_name": {
        "field": "title",
        "transform": {
          "type": "regex",
          "pattern": "^([^:–-]+)",
          "group": 1
        }
      },
      "website": "link",
      "industry": "category",
      "custom_fields": {
        "article_date": "pubDate",
        "summary": "description"
      }
    },
    "filters": {
      "titleContains": ["raises", "launches", "announces"]
    }
  },
  "polling_frequency": "0 */2 * * *"
}
```

### Example 4: E-commerce Scraper

```json
{
  "name": "Shopify Stores",
  "type": "playwright",
  "url": "https://shopify.com/store-directory",
  "config": {
    "browser": "chromium",
    "headless": true,
    "pagination": {
      "type": "scroll",
      "scrollAmount": 1500,
      "maxScrolls": 30,
      "waitAfterScroll": 2000,
      "stopWhen": {
        "selector": ".loading-indicator",
        "state": "hidden"
      }
    },
    "extraction": {
      "containerSelector": ".store-card",
      "fields": {
        "company_name": { "selector": ".store-name", "attribute": "text" },
        "website": {
          "selector": "a.store-link",
          "attribute": "href",
          "transform": {
            "type": "regex",
            "pattern": "https?://([^/]+)",
            "group": 0
          }
        },
        "industry": { "selector": ".category", "attribute": "text" },
        "contacts": {
          "selector": ".contact-info",
          "multiple": false,
          "fields": {
            "email": {
              "selector": ".email",
              "attribute": "text",
              "transform": "extractEmail"
            }
          }
        }
      }
    }
  },
  "rate_limit": 3,
  "polling_frequency": "0 0 * * 0"
}
```

---

## Testing Configuration

Before saving, test your configuration:

```http
POST /api/v1/data-sources/test
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "playwright",
  "url": "https://example.com",
  "config": { ... }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "leads_found": 25,
    "sample": [
      {
        "company_name": "Example Corp",
        "website": "https://example.com",
        "contacts": [...]
      }
    ],
    "warnings": [
      "Field 'industry' not found in 3 records"
    ],
    "execution_time_ms": 4521
  }
}
```

---

## Troubleshooting

### Common Issues

**"Element not found"**
- Check selector is correct using browser DevTools
- Add `waitForSelector` before extraction
- Page might be loading dynamically - increase timeout

**"Authentication failed"**
- Verify credentials are correct
- Check if login form selectors changed
- Look for CAPTCHA or 2FA requirements

**"Rate limited"**
- Reduce `rate_limit` value
- Enable proxy rotation
- Increase `delay_between_requests`

**"Empty results"**
- Verify `containerSelector` matches elements
- Check if site requires JavaScript - use Playwright not API type
- Site might be blocking scrapers - try different user agent

### Debug Mode

Enable verbose logging:

```json
{
  "config": {
    "debug": true,
    "screenshots": {
      "enabled": true,
      "on_error": true,
      "on_each_page": false
    }
  }
}
```

Screenshots saved to `storage/screenshots/{source_id}/{timestamp}.png`
