@echo off
setlocal enabledelayedexpansion

echo.
echo ========================================
echo   SalesBook Setup Script (Windows)
echo ========================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js 18+ from https://nodejs.org/
    exit /b 1
)

:: Check Node version
for /f "tokens=1" %%v in ('node -v') do set NODE_VERSION=%%v
echo [OK] Node.js found: %NODE_VERSION%

:: Check for npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed
    exit /b 1
)
echo [OK] npm found

:: Check for MySQL
where mysql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARNING] MySQL client not found in PATH
    echo Make sure MySQL 8.0+ is installed and running
    echo You may need to add MySQL bin directory to PATH
)

echo.
echo ----------------------------------------
echo Step 1: Installing dependencies...
echo ----------------------------------------

:: Install root dependencies if package.json exists
if exist "package.json" (
    echo Installing root dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install root dependencies
        exit /b 1
    )
)

:: Install server dependencies
echo Installing server dependencies...
cd server
if not exist "package.json" (
    echo [ERROR] server/package.json not found
    cd ..
    exit /b 1
)
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install server dependencies
    cd ..
    exit /b 1
)
cd ..

:: Install client dependencies
echo Installing client dependencies...
cd client
if not exist "package.json" (
    echo [ERROR] client/package.json not found
    cd ..
    exit /b 1
)
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install client dependencies
    cd ..
    exit /b 1
)
cd ..

echo [OK] All dependencies installed

echo.
echo ----------------------------------------
echo Step 2: Setting up environment...
echo ----------------------------------------

:: Create .env file if it doesn't exist
if not exist "server\.env" (
    if exist "server\.env.example" (
        copy "server\.env.example" "server\.env"
        echo [OK] Created server\.env from example
        echo.
        echo [ACTION REQUIRED] Please edit server\.env with your settings:
        echo   - DATABASE_URL: Your MySQL connection string
        echo   - JWT_SECRET: A random secret key
        echo   - ENCRYPTION_KEY: A 32-byte hex key
        echo.
    ) else (
        echo [ERROR] server\.env.example not found
        exit /b 1
    )
) else (
    echo [OK] server\.env already exists
)

:: Create storage directories
if not exist "server\storage" mkdir "server\storage"
if not exist "server\storage\attachments" mkdir "server\storage\attachments"
if not exist "server\storage\exports" mkdir "server\storage\exports"
if not exist "server\storage\scripts" mkdir "server\storage\scripts"
if not exist "server\logs" mkdir "server\logs"
echo [OK] Storage directories created

echo.
echo ----------------------------------------
echo Step 3: Database setup...
echo ----------------------------------------

:: Check if DATABASE_URL is configured
findstr /C:"DATABASE_URL=mysql://" "server\.env" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARNING] DATABASE_URL not configured in server\.env
    echo Please configure your database connection and run:
    echo   cd server
    echo   npx prisma migrate dev
    echo   npx prisma db seed
    goto :skip_db
)

:: Generate Prisma client
echo Generating Prisma client...
cd server
call npx prisma generate
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to generate Prisma client
    cd ..
    exit /b 1
)

:: Run migrations
echo Running database migrations...
call npx prisma migrate dev --name init
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Migration failed. Database might not be running.
    echo Please ensure MySQL is running and DATABASE_URL is correct.
    cd ..
    goto :skip_db
)

:: Seed database
echo Seeding database...
call npx prisma db seed
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Seeding failed or no seed file found
)

cd ..
echo [OK] Database setup complete

:skip_db

echo.
echo ----------------------------------------
echo Step 4: Building client...
echo ----------------------------------------

cd client
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Client build failed. You can build later with:
    echo   cd client ^&^& npm run build
    cd ..
) else (
    cd ..
    echo [OK] Client built successfully
)

echo.
echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Next steps:
echo.
echo 1. Configure server\.env with your settings
echo.
echo 2. Start the development servers:
echo    cd server ^&^& npm run dev
echo    (In another terminal)
echo    cd client ^&^& npm run dev
echo.
echo 3. Or start both with (if configured):
echo    npm run dev
echo.
echo 4. Access the application:
echo    Frontend: http://localhost:5173
echo    Backend:  http://localhost:3000
echo.
echo 5. Default admin credentials (after seeding):
echo    Email: admin@salesbook.local
echo    Password: Admin123!
echo.
echo For more information, see docs\INSTALLATION.md
echo.

pause
