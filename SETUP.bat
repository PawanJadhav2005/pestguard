@echo off
title PestGuard - SETUP
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and restart your PC.
  pause
  exit /b 1
)
node setup.js %*
echo.
pause
