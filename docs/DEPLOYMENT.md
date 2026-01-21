# SalesBook Deployment Guide

This guide covers deploying SalesBook to production environments.

## Table of Contents

1. [Deployment Options](#deployment-options)
2. [Pre-deployment Checklist](#pre-deployment-checklist)
3. [Docker Deployment](#docker-deployment)
4. [Manual Deployment](#manual-deployment)
5. [Cloud Deployments](#cloud-deployments)
6. [Reverse Proxy Configuration](#reverse-proxy-configuration)
7. [SSL/TLS Setup](#ssltls-setup)
8. [Database Production Setup](#database-production-setup)
9. [Monitoring & Logging](#monitoring--logging)
10. [Backup & Recovery](#backup--recovery)
11. [Scaling](#scaling)
12. [Security Hardening](#security-hardening)

---

## Deployment Options

| Method | Best For | Complexity |
|--------|----------|------------|
| Docker Compose | Small-medium deployments, VPS | Low |
| Kubernetes | Large scale, high availability | High |
| Manual | Full control, specific requirements | Medium |
| PaaS (Railway, Render) | Quick deployment, managed infra | Low |

---

## Pre-deployment Checklist

### Security
- [ ] Generate strong `JWT_SECRET` (min 64 characters)
- [ ] Generate strong `ENCRYPTION_KEY` (32 bytes)
- [ ] Set `NODE_ENV=production`
- [ ] Configure CORS to allow only your domain
- [ ] Review and restrict API rate limits
- [ ] Disable debug/verbose logging
- [ ] Remove default admin credentials

### Database
- [ ] Use dedicated MySQL user with limited permissions
- [ ] Enable SSL for database connections
- [ ] Configure connection pooling
- [ ] Set up automated backups

### Infrastructure
- [ ] Configure SSL/TLS certificates
- [ ] Set up reverse proxy (Nginx/Caddy)
- [ ] Configure firewall rules
- [ ] Set up monitoring and alerts
- [ ] Plan backup strategy

---

## Docker Deployment

### Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=mysql://salesbook:${DB_PASSWORD}@db:3306/salesbook
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - app_storage:/app/server/storage
    networks:
      - salesbook-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      - MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
      - MYSQL_DATABASE=salesbook
      - MYSQL_USER=salesbook
      - MYSQL_PASSWORD=${DB_PASSWORD}
    volumes:
      - db_data:/var/lib/mysql
      - ./mysql/conf.d:/etc/mysql/conf.d:ro
    networks:
      - salesbook-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${DB_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - certbot_certs:/etc/letsencrypt:ro
    depends_on:
      - app
    networks:
      - salesbook-network

volumes:
  db_data:
  app_storage:
  certbot_certs:

networks:
  salesbook-network:
    driver: bridge
```

### Production Dockerfile

```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm ci --only=production
RUN cd server && npm ci
RUN cd client && npm ci

# Copy source
COPY . .

# Build client
RUN cd client && npm run build

# Build server (if using TypeScript)
RUN cd server && npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S salesbook -u 1001 -G nodejs

# Copy built artifacts
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/client/dist ./client/dist

# Create storage directory
RUN mkdir -p server/storage && chown -R salesbook:nodejs server/storage

USER salesbook

EXPOSE 3000

CMD ["node", "server/dist/app.js"]
```

### Deploy with Docker

```bash
# Create .env file with production values
cat > .env << EOF
DB_ROOT_PASSWORD=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)
ENCRYPTION_KEY=$(openssl rand -hex 32)
EOF

# Build and start
docker-compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker-compose -f docker-compose.prod.yml exec app npx prisma migrate deploy

# Create first super admin
docker-compose -f docker-compose.prod.yml exec app node scripts/create-admin.js
```

---

## Manual Deployment

### Server Requirements

- Ubuntu 20.04+ or similar Linux
- Node.js 18 LTS
- MySQL 8.0+
- Nginx or Caddy
- PM2 for process management

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install MySQL
sudo apt install -y mysql-server

# Install Nginx
sudo apt install -y nginx

# Install PM2
sudo npm install -g pm2
```

### Step 2: Database Setup

```bash
# Secure MySQL installation
sudo mysql_secure_installation

# Create database and user
sudo mysql -e "
CREATE DATABASE salesbook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'salesbook'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON salesbook.* TO 'salesbook'@'localhost';
FLUSH PRIVILEGES;
"
```

### Step 3: Application Setup

```bash
# Create app user
sudo useradd -m -s /bin/bash salesbook
sudo su - salesbook

# Clone and setup
git clone https://github.com/your-org/salesbook.git
cd salesbook

# Install dependencies
npm run install:all

# Build frontend
cd client && npm run build && cd ..

# Configure environment
cp server/.env.example server/.env
nano server/.env  # Edit with production values

# Run migrations
cd server
npx prisma migrate deploy
npx prisma db seed
```

### Step 4: PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'salesbook',
    script: 'server/src/app.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    max_memory_restart: '500M'
  }]
};
```

Start with PM2:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Step 5: Nginx Configuration

See [Reverse Proxy Configuration](#reverse-proxy-configuration) below.

---

## Cloud Deployments

### AWS (EC2 + RDS)

1. **EC2 Instance**:
   - t3.medium or larger
   - Amazon Linux 2 or Ubuntu
   - Security group: ports 22, 80, 443

2. **RDS MySQL**:
   - db.t3.medium or larger
   - Multi-AZ for production
   - Enable automated backups

3. **S3 (optional)**:
   - For file storage (attachments, exports)

4. **Load Balancer**:
   - Application Load Balancer
   - SSL termination
   - Health checks to `/api/v1/health`

### DigitalOcean

1. **Droplet**:
   - 2GB RAM minimum
   - Ubuntu 22.04

2. **Managed MySQL**:
   - Primary-Standby cluster

3. **Spaces** (optional):
   - For file storage

### Railway/Render (PaaS)

Quick deployment with minimal configuration:

```bash
# Railway
railway init
railway add mysql
railway up

# Render
# Connect GitHub repo and configure:
# - Build command: npm run install:all && cd client && npm run build
# - Start command: cd server && npm start
```

---

## Reverse Proxy Configuration

### Nginx

Create `/etc/nginx/sites-available/salesbook`:

```nginx
upstream salesbook_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Client max body size (for file uploads)
    client_max_body_size 50M;

    # API routes
    location /api {
        proxy_pass http://salesbook_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # Webhooks (longer timeout)
    location /api/v1/webhooks {
        proxy_pass http://salesbook_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
    }

    # Static files (frontend)
    location / {
        root /var/www/salesbook/client/dist;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 30d;
            add_header Cache-Control "public, no-transform";
        }
    }

    # Health check
    location /health {
        proxy_pass http://salesbook_backend/api/v1/health;
        proxy_http_version 1.1;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/salesbook /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Caddy (Alternative)

`Caddyfile`:

```caddy
yourdomain.com {
    # API
    handle /api/* {
        reverse_proxy localhost:3000
    }

    # Webhooks with longer timeout
    handle /api/v1/webhooks/* {
        reverse_proxy localhost:3000 {
            transport http {
                read_timeout 600s
            }
        }
    }

    # Frontend
    handle {
        root * /var/www/salesbook/client/dist
        try_files {path} /index.html
        file_server
    }

    # Security headers
    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
    }
}
```

---

## SSL/TLS Setup

### Let's Encrypt (Certbot)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal (add to crontab)
0 0 * * * certbot renew --quiet
```

### Manual Certificate

```bash
# Create directory
sudo mkdir -p /etc/nginx/ssl

# Copy certificates
sudo cp your_certificate.crt /etc/nginx/ssl/
sudo cp your_private.key /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/*
```

---

## Database Production Setup

### MySQL Configuration

`/etc/mysql/conf.d/salesbook.cnf`:

```ini
[mysqld]
# Character set
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

# InnoDB settings
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
innodb_flush_log_at_trx_commit = 2
innodb_flush_method = O_DIRECT

# Connections
max_connections = 200
wait_timeout = 600

# Query cache (disabled in MySQL 8)
# query_cache_type = 0

# Logging
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2

# Binary logging (for replication/backups)
log_bin = /var/log/mysql/mysql-bin.log
expire_logs_days = 7
binlog_format = ROW
```

### Connection Pooling

In `server/.env`:

```env
DATABASE_URL="mysql://user:pass@localhost:3306/salesbook?connection_limit=20&pool_timeout=10"
```

---

## Monitoring & Logging

### PM2 Monitoring

```bash
# View logs
pm2 logs salesbook

# Monitor in terminal
pm2 monit

# PM2 Plus (cloud monitoring)
pm2 link <secret> <public>
```

### Application Logging

Configure Winston in production:

```javascript
// server/src/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760,  // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10485760,
      maxFiles: 5
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

### External Monitoring (Optional)

- **Uptime monitoring**: UptimeRobot, Pingdom
- **APM**: New Relic, Datadog, Sentry
- **Log aggregation**: ELK Stack, Papertrail

---

## Backup & Recovery

### Database Backup Script

`/opt/salesbook/backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/opt/salesbook/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="salesbook"
DB_USER="salesbook"
DB_PASS="your_password"

# Create backup
mysqldump -u$DB_USER -p$DB_PASS $DB_NAME | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Delete backups older than 30 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete

# Upload to S3 (optional)
# aws s3 cp $BACKUP_DIR/db_$DATE.sql.gz s3://your-bucket/backups/
```

Add to crontab:
```bash
0 2 * * * /opt/salesbook/backup.sh
```

### File Storage Backup

```bash
# Backup storage directory
tar -czf /opt/salesbook/backups/storage_$(date +%Y%m%d).tar.gz /app/server/storage

# Sync to S3
aws s3 sync /app/server/storage s3://your-bucket/storage/
```

### Restore Procedure

```bash
# Stop application
pm2 stop salesbook

# Restore database
gunzip < backup.sql.gz | mysql -u salesbook -p salesbook

# Restore files
tar -xzf storage_backup.tar.gz -C /

# Start application
pm2 start salesbook
```

---

## Scaling

### Vertical Scaling

- Increase server RAM/CPU
- Increase MySQL resources
- Optimize queries (add indexes)

### Horizontal Scaling

#### Multiple App Servers

1. Set up load balancer (Nginx, HAProxy, ALB)
2. Deploy app to multiple servers
3. Use shared session storage (or JWT is stateless)
4. Use shared file storage (S3, NFS)

#### Database Scaling

1. **Read replicas**: Route read queries to replicas
2. **Connection pooling**: Use PgBouncer or ProxySQL
3. **Sharding**: Split tenants across databases (advanced)

#### Background Jobs

Scale workers independently:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'salesbook-api',
      script: 'server/src/app.js',
      instances: 4,
      exec_mode: 'cluster'
    },
    {
      name: 'salesbook-worker',
      script: 'server/src/jobs/worker.js',
      instances: 2,
      exec_mode: 'cluster'
    }
  ]
};
```

---

## Security Hardening

### Environment Variables

Never commit secrets. Use:
- Environment variables
- Docker secrets
- AWS Parameter Store / Secrets Manager

### Firewall (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Fail2ban

```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

### Security Headers

Already configured in Nginx. Verify at: https://securityheaders.com

### Rate Limiting

Configure in application and Nginx:

```nginx
# Nginx rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

location /api {
    limit_req zone=api burst=20 nodelay;
    ...
}
```

### Regular Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade

# Update Node.js dependencies
npm audit fix

# Update Docker images
docker-compose pull
docker-compose up -d
```

---

## Production Checklist

- [ ] `NODE_ENV=production`
- [ ] Strong secrets generated
- [ ] SSL/TLS configured
- [ ] Firewall enabled
- [ ] Rate limiting configured
- [ ] Logging configured
- [ ] Backups automated
- [ ] Monitoring set up
- [ ] Default credentials changed
- [ ] Debug mode disabled
- [ ] CORS configured correctly
- [ ] Health checks working
- [ ] Database optimized
- [ ] File permissions correct
