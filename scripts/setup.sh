#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "========================================"
echo "  SalesBook Setup Script (Linux/macOS)"
echo "========================================"
echo ""

# Function to print colored output
print_ok() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check for Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    echo "Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
print_ok "Node.js found: $NODE_VERSION"

# Check Node version is 18+
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 18 ]; then
    print_error "Node.js 18+ is required. Found: $NODE_VERSION"
    exit 1
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed"
    exit 1
fi
print_ok "npm found"

# Check for MySQL (optional)
if ! command -v mysql &> /dev/null; then
    print_warning "MySQL client not found in PATH"
    echo "Make sure MySQL 8.0+ is installed and running"
fi

echo ""
echo "----------------------------------------"
echo "Step 1: Installing dependencies..."
echo "----------------------------------------"

# Install root dependencies if package.json exists
if [ -f "package.json" ]; then
    echo "Installing root dependencies..."
    npm install
fi

# Install server dependencies
echo "Installing server dependencies..."
if [ ! -f "server/package.json" ]; then
    print_error "server/package.json not found"
    exit 1
fi
cd server
npm install
cd ..

# Install client dependencies
echo "Installing client dependencies..."
if [ ! -f "client/package.json" ]; then
    print_error "client/package.json not found"
    exit 1
fi
cd client
npm install
cd ..

print_ok "All dependencies installed"

echo ""
echo "----------------------------------------"
echo "Step 2: Setting up environment..."
echo "----------------------------------------"

# Create .env file if it doesn't exist
if [ ! -f "server/.env" ]; then
    if [ -f "server/.env.example" ]; then
        cp server/.env.example server/.env
        print_ok "Created server/.env from example"
        echo ""
        print_warning "Please edit server/.env with your settings:"
        echo "  - DATABASE_URL: Your MySQL connection string"
        echo "  - JWT_SECRET: A random secret key"
        echo "  - ENCRYPTION_KEY: A 32-byte hex key"
        echo ""

        # Generate secrets if openssl is available
        if command -v openssl &> /dev/null; then
            echo "Generating secrets..."
            JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
            ENCRYPTION_KEY=$(openssl rand -hex 32)

            # Update .env file with generated secrets
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS
                sed -i '' "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" server/.env
                sed -i '' "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENCRYPTION_KEY|" server/.env
            else
                # Linux
                sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" server/.env
                sed -i "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENCRYPTION_KEY|" server/.env
            fi
            print_ok "Generated JWT_SECRET and ENCRYPTION_KEY"
        fi
    else
        print_error "server/.env.example not found"
        exit 1
    fi
else
    print_ok "server/.env already exists"
fi

# Create storage directories
mkdir -p server/storage/attachments
mkdir -p server/storage/exports
mkdir -p server/storage/scripts
mkdir -p server/logs
print_ok "Storage directories created"

echo ""
echo "----------------------------------------"
echo "Step 3: Database setup..."
echo "----------------------------------------"

# Check if DATABASE_URL is configured (not the default placeholder)
if grep -q "DATABASE_URL=mysql://user:password@localhost" server/.env; then
    print_warning "DATABASE_URL not configured in server/.env"
    echo "Please configure your database connection and run:"
    echo "  cd server"
    echo "  npx prisma migrate dev"
    echo "  npx prisma db seed"
else
    # Generate Prisma client
    echo "Generating Prisma client..."
    cd server
    npx prisma generate

    # Run migrations
    echo "Running database migrations..."
    if npx prisma migrate dev --name init 2>/dev/null; then
        print_ok "Migrations completed"

        # Seed database
        echo "Seeding database..."
        if npx prisma db seed 2>/dev/null; then
            print_ok "Database seeded"
        else
            print_warning "Seeding failed or no seed file found"
        fi
    else
        print_warning "Migration failed. Database might not be running."
        echo "Please ensure MySQL is running and DATABASE_URL is correct."
    fi
    cd ..
fi

echo ""
echo "----------------------------------------"
echo "Step 4: Building client..."
echo "----------------------------------------"

cd client
if npm run build 2>/dev/null; then
    cd ..
    print_ok "Client built successfully"
else
    cd ..
    print_warning "Client build failed. You can build later with:"
    echo "  cd client && npm run build"
fi

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Configure server/.env with your settings"
echo "   (especially DATABASE_URL)"
echo ""
echo "2. Start the development servers:"
echo "   cd server && npm run dev"
echo "   (In another terminal)"
echo "   cd client && npm run dev"
echo ""
echo "3. Or start both with (if configured):"
echo "   npm run dev"
echo ""
echo "4. Access the application:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3000"
echo ""
echo "5. Default admin credentials (after seeding):"
echo "   Email: admin@salesbook.local"
echo "   Password: Admin123!"
echo ""
echo "For more information, see docs/INSTALLATION.md"
echo ""
