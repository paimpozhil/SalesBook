# Claude Development Guide for SalesBook

This file provides context and instructions for AI assistants (Claude) working on the SalesBook project.

## Project Overview

SalesBook is a multi-tenant lead generation and CRM platform built with:
- **Frontend**: React 18 + Vite + Bootstrap 5
- **Backend**: Node.js + Express.js
- **Database**: MySQL 8 + Prisma ORM
- **Authentication**: JWT tokens
- **Background Jobs**: MySQL-backed queue with node-cron

## Key Documentation

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Project overview and quick start |
| [PLAN.md](PLAN.md) | Detailed architecture, database schema, and implementation phases |
| [AGENTS.md](AGENTS.md) | Specialized agent roles and responsibilities |
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Detailed setup instructions |
| [docs/API.md](docs/API.md) | REST API reference |
| [docs/SCRAPER_CONFIG.md](docs/SCRAPER_CONFIG.md) | Data source configuration guide |

## Agent System

**Always refer to [AGENTS.md](AGENTS.md) when working on specific features.**

The project uses a modular agent system where different AI agents handle different domains:

### Backend Agents
- `backend-core-agent` - Express setup, middleware, routing
- `backend-auth-agent` - Authentication, JWT, RBAC
- `backend-leads-agent` - Lead and contact management
- `backend-scraper-agent` - Playwright scraping, API polling
- `backend-channels-agent` - Email, SMS, WhatsApp, Telegram, Voice
- `backend-campaign-agent` - Campaign sequences, templates
- `backend-jobs-agent` - Background job processing

### Frontend Agents
- `frontend-core-agent` - React setup, layout, common components
- `frontend-auth-agent` - Login, registration, auth state
- `frontend-crm-agent` - Lead management UI
- `frontend-campaign-agent` - Campaign builder, templates

### Infrastructure Agents
- `database-agent` - Prisma schema, migrations
- `devops-agent` - Docker, CI/CD, deployment
- `testing-agent` - Unit, integration, E2E tests

## Development Guidelines

### Code Style

**Backend (Node.js)**:
```javascript
// Use async/await
async function getLeads(tenantId, filters) {
  try {
    const leads = await prisma.lead.findMany({
      where: { tenant_id: tenantId, ...filters },
      include: { contacts: true }
    });
    return leads;
  } catch (error) {
    logger.error('Failed to fetch leads', { error, tenantId });
    throw new AppError('LEADS_FETCH_FAILED', 500);
  }
}

// Service layer pattern
// controllers/ -> call services
// services/ -> business logic + database
// routes/ -> validation + auth middleware
```

**Frontend (React)**:
```jsx
// Functional components with hooks
function LeadList() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const { tenantId } = useAuth();

  useEffect(() => {
    fetchLeads();
  }, []);

  // Early returns for loading/error states
  if (loading) return <LoadingSpinner />;

  return (
    <Container>
      <LeadTable data={leads} />
    </Container>
  );
}
```

### API Response Format

**Success Response**:
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

**Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [
      { "field": "email", "message": "Email is required" }
    ]
  }
}
```

### Multi-Tenancy Rules

1. **ALL database queries must include tenant_id** (except super_admin operations)
2. Tenant context is injected via middleware after authentication
3. Never trust client-provided tenant_id - always use `req.tenantId`

```javascript
// Correct
const leads = await prisma.lead.findMany({
  where: { tenant_id: req.tenantId }
});

// WRONG - security vulnerability
const leads = await prisma.lead.findMany({
  where: { tenant_id: req.body.tenantId }
});
```

### Security Checklist

- [ ] Validate all inputs (use Joi or express-validator)
- [ ] Sanitize data before database insertion
- [ ] Use parameterized queries (Prisma handles this)
- [ ] Encrypt sensitive data (API keys, credentials)
- [ ] Implement rate limiting on sensitive endpoints
- [ ] Never log sensitive data (passwords, tokens, API keys)
- [ ] Always scope queries by tenant_id

## File Structure Reference

```
salesbook/
├── client/                     # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/         # Reusable: Button, Modal, Table
│   │   │   ├── layout/         # Navbar, Sidebar, Footer
│   │   │   ├── leads/          # Lead-specific components
│   │   │   ├── campaigns/      # Campaign components
│   │   │   └── ...
│   │   ├── pages/              # Route page components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── services/           # API client functions
│   │   ├── store/              # State management
│   │   └── utils/              # Utility functions
│   └── package.json
│
├── server/                     # Node.js backend
│   ├── src/
│   │   ├── config/             # App configuration
│   │   ├── controllers/        # Request handlers
│   │   ├── middleware/         # Express middleware
│   │   ├── routes/             # Route definitions
│   │   ├── services/           # Business logic
│   │   ├── jobs/               # Background workers
│   │   ├── scrapers/           # Data source handlers
│   │   └── utils/              # Utility functions
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── migrations/         # Database migrations
│   └── package.json
│
├── docs/                       # Documentation
├── scripts/                    # Setup & utility scripts
└── docker-compose.yml
```

## Common Tasks

### Adding a New API Endpoint

1. Create route in `server/src/routes/`
2. Create controller in `server/src/controllers/`
3. Create service in `server/src/services/`
4. Add validation middleware
5. Register route in `server/src/app.js`
6. Update API documentation

### Adding a New Database Table

1. Update `server/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name description`
3. Update seed file if needed
4. Create corresponding service functions

### Adding a New React Page

1. Create page component in `client/src/pages/`
2. Add route in `client/src/App.jsx`
3. Add navigation link in Sidebar
4. Create any needed components in `client/src/components/`

### Adding a New Communication Channel

1. Create service in `server/src/services/{channel}.service.js`
2. Implement the channel interface (send, getStatus, validateConfig)
3. Add webhook handler in `server/src/routes/webhooks.js`
4. Add channel type to `channel_configs` enum in Prisma schema
5. Create frontend configuration UI

## Environment Variables

See `server/.env.example` for all available options. Key variables:

```env
# Required
DATABASE_URL=mysql://user:pass@localhost:3306/salesbook
JWT_SECRET=your-secret-key

# Optional - enable features
SMTP_HOST=smtp.example.com
TWILIO_ACCOUNT_SID=...
WHATSAPP_ACCESS_TOKEN=...
TELEGRAM_BOT_TOKEN=...
```

## Testing

```bash
# Run backend tests
cd server && npm test

# Run frontend tests
cd client && npm test

# Run specific test file
npm test -- --grep "auth"

# Run with coverage
npm test -- --coverage
```

## Debugging

### Backend
- Logs are in `server/logs/`
- Use `DEBUG=salesbook:*` for verbose logging
- Prisma query logging: set `DEBUG=prisma:query`

### Frontend
- React DevTools for component inspection
- Network tab for API debugging
- Console for JavaScript errors

## Deployment

### Docker (Recommended)
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Manual
```bash
# Build frontend
cd client && npm run build

# Start backend (serves frontend static files)
cd server && NODE_ENV=production npm start
```

## Getting Help

1. Check existing documentation in `docs/`
2. Review similar implementations in codebase
3. Refer to [AGENTS.md](AGENTS.md) for domain-specific guidance
4. Check [PLAN.md](PLAN.md) for architectural decisions

## Conventions Summary

| Convention | Rule |
|------------|------|
| File naming | camelCase for JS, kebab-case for components |
| Component naming | PascalCase |
| API routes | kebab-case, plural nouns |
| Database tables | snake_case, plural |
| Environment vars | SCREAMING_SNAKE_CASE |
| Git commits | Conventional commits (feat:, fix:, etc.) |
