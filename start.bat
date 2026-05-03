@echo off
title Fino
echo Starting Fino...
echo.

start "Backend - Fino" cmd /k "cd /d "%~dp0backend" && npm run dev"
timeout /t 2 /nobreak >nul
start "Frontend - Fino" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo Both servers are starting...
echo Backend  -^> http://localhost:5000
echo Frontend -^> http://localhost:5173
echo.
echo Close the terminal windows to stop the servers.
pause