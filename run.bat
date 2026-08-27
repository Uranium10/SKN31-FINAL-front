@echo off
setlocal
cd /d "%~dp0"

echo [BiddingFlow] Installing frontend dependencies...
call npm install
if errorlevel 1 (
  echo [BiddingFlow] npm install failed. The development server was not started.
  pause
  exit /b 1
)

echo [BiddingFlow] Starting the Vite development server...
call npm run dev -- --open
endlocal
