@echo off
title Stop CorelFlow Studio
echo Stopping CorelFlow Studio background engine...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)
echo CorelFlow Studio has been completely stopped.
timeout /t 2 >nul
