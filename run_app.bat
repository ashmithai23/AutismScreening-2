@echo off
title TinyTots ASD Screening Launcher
echo ========================================================
echo   Starting TinyTots ASD Screening Application
echo ========================================================
echo.
echo Starting FastAPI Backend on port 8000...
start "TinyTots Backend (FastAPI)" cmd /k "python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload"

echo Starting React/Vite Frontend on port 8080...
start "TinyTots Frontend (Vite)" cmd /k "cd /d "%~dp0tiny-tots-assess-main" && npm run dev"

echo.
echo ========================================================
echo   Services Launched:
echo   - Backend:  http://127.0.0.1:8000
echo   - API Docs: http://127.0.0.1:8000/docs
echo   - Frontend: http://localhost:8080
echo ========================================================
