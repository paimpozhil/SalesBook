# SalesBook Installation Guide

This guide covers all installation methods for SalesBook.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Install (Automated)](#quick-install-automated)
3. [Manual Installation](#manual-installation)
4. [Docker Installation](#docker-installation)
5. [Database Setup](#database-setup)
6. [Configuration](#configuration)
7. [Verifying Installation](#verifying-installation)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18.x or higher | Runtime |
| npm | 9.x or higher | Package manager |
| MySQL | 8.0 or higher | Database |

### Optional Software

| Software | Version | Purpose |
|----------|---------|---------|
| Docker | 20.x+ | Containerization |
| Docker Compose | 2.x+ | Multi-container orchestration |
| Git | 2.x+ | Version control |

### System Requirements

- **RAM**: Minimum 4GB, Recommended 8GB+
- **Storage**: Minimum 2GB free space
- **OS**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+)

---

## Quick Install (Automated)

### Windows

```powershell
# Clone repository
git clone https://github.com/your-org/salesbook.git
cd salesbook

# Run setup script
.\scripts\setup.bat
```

### Linux/macOS

```bash
# Clone repository
git clone https://github.com/your-org/salesbook.git
cd salesbook

# Make script executable and run
chmod +x scripts/setup.sh
./scripts/setup.sh
```

The setup script will:
1. Check prerequisites
2. Install dependencies
3. Create environment files
4. Setup the database
5. Run migrations
6. Seed initial data
7. Start development servers

---

## Manual Installation

### Step 1: Clone Repository

```bash
git clone https://github.com/your-org/salesbook.git
cd salesbook
```

### Step 2: Install Dependencies

```bash
# Install root dependencies (if any)
npm install

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install

# Return to root
cd ..
```

### Step 3: Configure Environment

```bash
# Copy example environment file
cp server/.env.example server/.env

# Edit the environment file
# Windows: notepad server\.env
# Linux/Mac: nano server/.env
```

Required environment variables:

```env
# Database - REQUIRED
DATABASE_URL=mysql://username:password@localhost:3306/salesbook

# JWT Secret - REQUIRED (generate a random string)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Application
NODE_ENV=development
PORT=3000
CLIENT_URL=http://localhost:5173
```

### Step 4: Create Database

```bash
# Connect to MySQL
mysql -u root -p

# In MySQL prompt:
CREATE DATABASE salesbook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'salesbook'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON salesbook.* TO 'salesbook'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Step 5: Run Migrations

```bash
cd server

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database (creates super admin and sample data)
npx prisma db seed
```

### Step 6: Start Development Servers

**Option A: Separate terminals**

```bash
# Terminal 1 - Backend
cd server
npm run dev

# Terminal 2 - Frontend
cd client
npm run dev
```

**Option B: Concurrent (from root)**

```bash
npm run dev
```

### Step 7: Access Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000/api/v1
- **API Health Check**: http://localhost:3000/api/v1/health

**Default Super Admin Credentials**:
- Email: `admin@salesbook.local`
- Password: `Admin123!`

---

## Docker Installation

### Prerequisites

- Docker 20.x or higher
- Docker Compose 2.x or higher

### Step 1: Configure Environment

```bash
# Copy environment file
cp .env.example .env

# Edit as needed
# The Docker setup uses different defaults
```

### Step 2: Build and Start

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps
```

### Step 3: Initialize Database

```bash
# Run migrations
docker-compose exec server npx prisma migrate deploy

# Seed database
docker-compose exec server npx prisma db seed
```

### Step 4: Access Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **MySQL**: localhost:3306

### Docker Commands Reference

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v

# Rebuild after code changes
docker-compose up -d --build

# View logs for specific service
docker-compose logs -f server

# Execute command in container
docker-compose exec server npm run migrate

# Access MySQL shell
docker-compose exec db mysql -u salesbook -p salesbook
```

---

## Database Setup

### MySQL Configuration

For optimal performance, add these settings to your MySQL configuration:

**my.cnf / my.ini**:
```ini
[mysqld]
# Character set
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci

# Performance
innodb_buffer_pool_size=256M
innodb_log_file_size=64M
max_connections=150

# Timezone
default-time-zone='+00:00'
```

### Database Schema

The schema is managed by Prisma. Key tables:

- `tenants` - Organizations/companies
- `users` - User accounts
- `leads` - Lead/company records
- `contacts` - Contact persons (multiple per lead)
- `data_sources` - Scraper/API configurations
- `channel_configs` - Communication channel settings
- `campaigns` - Outreach campaigns
- `templates` - Message templates
- `contact_attempts` - Communication log
- `job_queue` - Background job queue

### Migrations

```bash
# Create new migration
npx prisma migrate dev --name description_of_change

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# View migration status
npx prisma migrate status
```

---

## Configuration

### Environment Variables Reference

#### Core Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | development | Environment mode |
| `PORT` | No | 3000 | Backend server port |
| `CLIENT_URL` | No | http://localhost:5173 | Frontend URL for CORS |
| `APP_URL` | No | http://localhost:3000 | Backend URL |

#### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | MySQL connection string |

Format: `mysql://USER:PASSWORD@HOST:PORT/DATABASE`

#### Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret for signing JWTs |
| `JWT_EXPIRES_IN` | No | 1h | Access token expiry |
| `JWT_REFRESH_EXPIRES_IN` | No | 7d | Refresh token expiry |

#### File Storage

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STORAGE_PATH` | No | ./storage | Local file storage path |

#### Email (SMTP)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | - | SMTP server hostname |
| `SMTP_PORT` | No | 587 | SMTP port |
| `SMTP_SECURE` | No | false | Use TLS |
| `SMTP_USER` | No | - | SMTP username |
| `SMTP_PASS` | No | - | SMTP password |
| `SMTP_FROM` | No | - | Default from address |

#### Twilio (SMS/Voice)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | No | - | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | No | - | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | No | - | Twilio phone number |

#### WhatsApp Business API

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WHATSAPP_API_URL` | No | - | WhatsApp API URL |
| `WHATSAPP_ACCESS_TOKEN` | No | - | Access token |
| `WHATSAPP_PHONE_NUMBER_ID` | No | - | Phone number ID |

#### Telegram

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | No | - | Bot token from BotFather |

#### Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENCRYPTION_KEY` | Yes | - | 32-byte key for encrypting credentials |
| `RATE_LIMIT_WINDOW` | No | 15 | Rate limit window (minutes) |
| `RATE_LIMIT_MAX` | No | 100 | Max requests per window |

### Generating Secrets

```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Generate encryption key (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Verifying Installation

### Health Check

```bash
# Check backend health
curl http://localhost:3000/api/v1/health

# Expected response:
# {"status":"ok","timestamp":"...","version":"1.0.0"}
```

### Test Login

```bash
# Test authentication
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@salesbook.local","password":"Admin123!"}'

# Expected: JSON with accessToken
```

### Database Connection

```bash
cd server
npx prisma db pull
# Should complete without errors
```

---

## Troubleshooting

### Common Issues

#### "Cannot connect to database"

1. Verify MySQL is running:
   ```bash
   # Windows
   net start mysql

   # Linux
   sudo systemctl status mysql
   ```

2. Check connection string in `.env`

3. Verify user permissions:
   ```sql
   SHOW GRANTS FOR 'salesbook'@'localhost';
   ```

#### "Port already in use"

```bash
# Find process using port 3000
# Windows
netstat -ano | findstr :3000

# Linux/Mac
lsof -i :3000

# Kill process or change PORT in .env
```

#### "Prisma migration failed"

```bash
# Reset and retry
cd server
npx prisma migrate reset
npx prisma migrate dev
```

#### "Node modules issues"

```bash
# Clear and reinstall
rm -rf node_modules
rm -rf server/node_modules
rm -rf client/node_modules
npm run install:all
```

#### "CORS errors in browser"

Check `CLIENT_URL` in server `.env` matches your frontend URL exactly.

#### "JWT errors"

1. Ensure `JWT_SECRET` is set
2. Clear browser cookies/localStorage
3. Restart server

### Getting Help

1. Check logs:
   ```bash
   # Server logs
   cat server/logs/error.log

   # Docker logs
   docker-compose logs server
   ```

2. Enable debug mode:
   ```bash
   DEBUG=salesbook:* npm run dev
   ```

3. Check Prisma:
   ```bash
   npx prisma studio
   # Opens database browser at http://localhost:5555
   ```

---

## Next Steps

After installation:

1. **Change default password**: Log in and update the super admin password
2. **Create a tenant**: Register a new organization
3. **Configure channels**: Set up email, SMS, or other communication channels
4. **Add data source**: Configure a scraper or API to collect leads
5. **Import leads**: Upload a CSV or start scraping

See [README.md](../README.md) for usage documentation.
