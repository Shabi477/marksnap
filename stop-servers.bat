@echo off
title MarkSnap - Stopping Servers
echo ============================================
echo         MarkSnap - Stopping Servers
echo ============================================
echo.

:: Kill uvicorn (backend)
echo Stopping backend server...
taskkill /f /im uvicorn.exe >nul 2>&1
:: Also kill python processes running uvicorn
for /f "tokens=2" %%a in ('tasklist /fi "WINDOWTITLE eq MarkSnap Backend*" /fo list ^| findstr "PID:"') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Kill node/vite (frontend)
echo Stopping frontend server...
for /f "tokens=2" %%a in ('tasklist /fi "WINDOWTITLE eq MarkSnap Frontend*" /fo list ^| findstr "PID:"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo.
echo ============================================
echo   All MarkSnap servers have been stopped.
echo ============================================
echo.
pause
