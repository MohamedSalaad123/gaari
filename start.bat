@echo off
title HaulLedger - Online Daily Truck Management System
cd /d "%~dp0"

echo ============================================================
echo   HaulLedger - Online Daily Truck Management System
echo ============================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed. Please install Node.js 20+ from https://nodejs.org/
  pause
  exit /b 1
)

if not exist ".env" (
  echo [WARNING] .env file not found. Copy .env.example to .env and set MONGODB_URI and JWT_SECRET.
  echo.
)

if not exist "node_modules" (
  echo [1/3] Installing dependencies...
  call npm install
  if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
  )
)

if not exist "dist" (
  echo [2/3] Building application...
  call npm run build
  if %errorlevel% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
  )
)

echo [3/3] Starting HaulLedger server at http://localhost:3000 ...
echo Press Ctrl+C in this window to stop the server safely.
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"
set NODE_ENV=production
call npx tsx server.ts
pause
