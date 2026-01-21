# ===========================================
# SalesBook Dockerfile
# Multi-stage build for development and production
# ===========================================

# -------------------------------------------
# Base stage - shared dependencies
# -------------------------------------------
FROM node:18-alpine AS base

# Install system dependencies for Prisma and Playwright
RUN apk add --no-cache \
    openssl \
    libc6-compat \
    curl

WORKDIR /app

# -------------------------------------------
# Dependencies stage
# -------------------------------------------
FROM base AS deps

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install server dependencies
WORKDIR /app/server
RUN npm ci

# Install client dependencies
WORKDIR /app/client
RUN npm ci

WORKDIR /app

# -------------------------------------------
# Development stage
# -------------------------------------------
FROM base AS development

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/client/node_modules ./client/node_modules

# Copy source code (will be overridden by volume mount in docker-compose)
COPY . .

# Generate Prisma client
WORKDIR /app/server
RUN npx prisma generate

WORKDIR /app

# Expose ports
EXPOSE 3000
EXPOSE 5173

# Default command (overridden in docker-compose)
CMD ["npm", "run", "dev"]

# -------------------------------------------
# Builder stage - builds production artifacts
# -------------------------------------------
FROM base AS builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=deps /app/client/node_modules ./client/node_modules

# Copy source code
COPY . .

# Generate Prisma client
WORKDIR /app/server
RUN npx prisma generate

# Build client
WORKDIR /app/client
RUN npm run build

# Build server (if using TypeScript, otherwise skip)
WORKDIR /app/server
# RUN npm run build  # Uncomment if using TypeScript

WORKDIR /app

# -------------------------------------------
# Production stage - minimal runtime image
# -------------------------------------------
FROM node:18-alpine AS production

# Install runtime dependencies only
RUN apk add --no-cache \
    openssl \
    libc6-compat \
    curl \
    dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S salesbook -u 1001 -G nodejs

WORKDIR /app

# Copy built client
COPY --from=builder --chown=salesbook:nodejs /app/client/dist ./client/dist

# Copy server source and dependencies
COPY --from=builder --chown=salesbook:nodejs /app/server/package*.json ./server/
COPY --from=builder --chown=salesbook:nodejs /app/server/node_modules ./server/node_modules
COPY --from=builder --chown=salesbook:nodejs /app/server/src ./server/src
COPY --from=builder --chown=salesbook:nodejs /app/server/prisma ./server/prisma

# If using TypeScript, copy compiled output instead:
# COPY --from=builder --chown=salesbook:nodejs /app/server/dist ./server/dist

# Create storage and logs directories
RUN mkdir -p server/storage server/logs && \
    chown -R salesbook:nodejs server/storage server/logs

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Switch to non-root user
USER salesbook

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/api/v1/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["node", "server/src/app.js"]

# -------------------------------------------
# Playwright stage - for scraping with browsers
# -------------------------------------------
FROM mcr.microsoft.com/playwright:v1.40.0-focal AS playwright

WORKDIR /app

# Install Node.js dependencies
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist

# Create non-root user
RUN useradd -m -s /bin/bash salesbook && \
    mkdir -p server/storage server/logs && \
    chown -R salesbook:salesbook server/storage server/logs

ENV NODE_ENV=production
ENV PORT=3000

USER salesbook

EXPOSE 3000

CMD ["node", "server/src/app.js"]
