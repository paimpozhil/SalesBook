# SalesBook

A multi-tenant lead generation and CRM platform for managing leads, executing multi-channel outreach campaigns, and tracking all customer interactions.

## Features

- **Lead Collection**: Scrape websites with Playwright, poll APIs/JSON/RSS feeds, or manual entry
- **CRM**: Manage leads with multiple contacts, custom fields, tags, and statuses
- **Multi-Channel Outreach**: Email (SMTP/API), SMS (Twilio), WhatsApp (Web/Business), Telegram, Voice
- **Campaign Sequences**: Automated drip campaigns with customizable delays
- **Templates**: Reusable message templates with variable substitution
- **Contact Tracking**: Log every interaction, track opens/clicks/replies
- **Conversations**: Unified inbox for all channels
- **Analytics**: Channel and campaign performance metrics
- **Multi-Tenant**: Isolated data per organization with role-based access

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React 18, Vite, Bootstrap 5 |
| Backend | Node.js, Express.js |
| Database | MySQL 8.0+ |
| ORM | Prisma |
| Authentication | JWT |
| Web Scraping | Playwright |
| Background Jobs | Node-cron + MySQL queue |

## Quick Start

### Prerequisites

- Node.js 18+
- MySQL 8.0+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/salesbook.git
cd salesbook

# Run the setup script
# Windows
scripts\setup.bat

# Linux/Mac
chmod +x scripts/setup.sh
./scripts/setup.sh
```

Or manually:

```bash
# Install all dependencies
npm run install:all

# Configure environment
cp server/.env.example server/.env
# Edit server/.env with your database credentials

# Setup database
cd server
npx prisma migrate dev
npx prisma db seed
cd ..

# Start development servers
npm run dev
```

### With Docker

```bash
# Copy and configure environment
cp .env.example .env

# Start all services
docker-compose up -d

# Run database migrations
docker-compose exec server npx prisma migrate deploy
docker-compose exec server npx prisma db seed
```

## Project Structure

```
salesbook/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API client
│   │   ├── store/          # State management
│   │   └── utils/          # Utilities
│   └── package.json
├── server/                 # Node.js backend
│   ├── src/
│   │   ├── config/         # Configuration
│   │   ├── controllers/    # Request handlers
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── jobs/           # Background workers
│   │   └── scrapers/       # Data source handlers
│   ├── prisma/             # Database schema & migrations
│   └── package.json
├── docs/                   # Documentation
├── scripts/                # Setup & utility scripts
└── docker-compose.yml
```

## Documentation

- [Installation Guide](docs/INSTALLATION.md) - Detailed setup instructions
- [API Reference](docs/API.md) - REST API documentation
- [Scraper Configuration](docs/SCRAPER_CONFIG.md) - How to configure data sources
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment
- [Development Plan](PLAN.md) - Feature roadmap and architecture

## Development

```bash
# Start both frontend and backend in development mode
npm run dev

# Start only backend
npm run dev:server

# Start only frontend
npm run dev:client

# Run tests
npm test

# Lint code
npm run lint

# Build for production
npm run build
```

## Environment Variables

Key configuration options (see `server/.env.example` for full list):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string |
| `JWT_SECRET` | Secret for JWT signing |
| `PORT` | Backend server port (default: 3000) |
| `SMTP_*` | Email SMTP configuration |
| `TWILIO_*` | Twilio SMS/Voice credentials |
| `WHATSAPP_*` | WhatsApp Business API settings |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Write/update tests
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.
