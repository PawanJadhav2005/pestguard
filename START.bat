@echo off
title PestGuard - START
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and restart your PC.
  pause
  exit /b 1
)
node start.js %*
echo.
pause
