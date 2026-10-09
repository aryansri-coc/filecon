@echo off
setlocal
cd /d "%~dp0"
title CorelFlow Studio Launcher

echo ===================================================
echo   CorelFlow Studio - All-in-One Offline Suite
echo ===================================================
echo.

:: Check if server is already running on port 3000
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [1/2] Starting offline background engine...
    start /b "" node server.js >nul 2>&1
    timeout /t 2 /nobreak >nul
) else (
    echo [1/2] Offline engine is already running.
)

echo [2/2] Launching dedicated application window...
set "APP_URL=http://localhost:3000"

:: Try Edge in App Mode (Dedicated frameless desktop window)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=%APP_URL% --window-size=1320,860
    exit /b
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=%APP_URL% --window-size=1320,860
    exit /b
)

:: Try Chrome in App Mode
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%APP_URL% --window-size=1320,860
    exit /b
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app=%APP_URL% --window-size=1320,860
    exit /b
)

:: Fallback
start "" %APP_URL%
exit /b
