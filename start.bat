@echo off
title Bank Analyzer

echo Starting Bank Analyzer...
echo.

:: Start backend in a new window
start "Backend - BankLens" cmd /k "cd /d "%~dp0backend" && npm run dev"

:: Wait 2 seconds for backend to initialize
timeout /t 2 /nobreak >nul

:: Start frontend in a new window
start "Frontend - BankLens" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: Wait 3 seconds then open browser
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo Both servers are starting...
echo Backend  -> http://localhost:5000
echo Frontend -> http://localhost:5173
echo.
echo Close the terminal windows to stop the servers.
pause
