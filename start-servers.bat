@echo off
title MarkSnap - Starting Servers
echo ============================================
echo         MarkSnap - Starting Servers
echo ============================================
echo.

:: Start backend server in a new window
echo Starting backend server on http://127.0.0.1:8000 ...
start "MarkSnap Backend" cmd /k "cd /d "%~dp0backend" && .\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

:: Give backend a moment to start
timeout /t 3 /nobreak >nul

:: Start frontend server in a new window
echo Starting frontend server on http://localhost:5173 ...
start "MarkSnap Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ============================================
echo   Both servers are starting in new windows.
echo   Backend:  http://127.0.0.1:8000
echo   Frontend: http://localhost:5173
echo ============================================
echo.
echo You can close this window.
pause
