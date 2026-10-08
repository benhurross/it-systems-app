@echo off
rem Starts the AP IT System and keeps it running: waits for Docker and the database, then runs the
rem app, starting it again if it ever stops. The "AP IT System" task runs this when you sign in to
rem Windows (see setup-windows.ps1); it can also be double-clicked. What the app says goes to
rem logs\app.log. Stop it with stop-app.cmd, or by closing its window.
setlocal
title AP IT System - closing this window stops the app
cd /d "%~dp0..\.."
if not exist logs mkdir logs
del logs\stop.flag 2>nul

node -e "require('net').connect(3200,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))" && (
  echo The app is already running on port 3200.
  exit /b 0
)
if exist logs\app.log move /y logs\app.log logs\app.previous.log >nul

rem The database runs in Docker. Docker Desktop is started if it is not running yet, then given up
rem to 10 minutes to be ready.
where docker >nul 2>&1 || goto app
echo Waiting for Docker...
set tries=0
:docker
docker info >nul 2>&1 && goto database
if %tries%==0 if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a tries+=1
if %tries% geq 60 (
  echo [%date% %time%] Docker did not start within 10 minutes, so the app was not started.>> logs\app.log
  echo Docker did not start within 10 minutes. Start Docker Desktop, then run this again.
  exit /b 1
)
ping -n 11 127.0.0.1 >nul
goto docker
:database
echo Starting the database...
docker compose up -d --wait >> logs\app.log 2>&1

:app
echo.
echo AP IT System is running at http://localhost:3200
echo Keep this window open: closing it stops the app. Log: %cd%\logs\app.log
:run
echo [%date% %time%] Starting the app>> logs\app.log
call npm start >> logs\app.log 2>&1
if exist logs\stop.flag (
  del logs\stop.flag
  echo [%date% %time%] Stopped>> logs\app.log
  exit /b 0
)
echo [%date% %time%] The app stopped unexpectedly, starting it again in 10 seconds>> logs\app.log
ping -n 11 127.0.0.1 >nul
goto run
