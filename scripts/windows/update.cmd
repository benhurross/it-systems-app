@echo off
rem Brings the app up to the latest version: a backup first, then stop, get the new version,
rem install, update the database, build, and start again.
setlocal
cd /d "%~dp0..\.."

echo Making a backup first...
call npm run backup || (
  echo The backup failed, so nothing was updated. The app is still running.
  exit /b 1
)
call "%~dp0stop-app.cmd"
git pull --ff-only || goto failed
call npm ci || goto failed
call npm run db:migrate || goto failed
call npm run build || goto failed

schtasks /Query /TN "AP IT System" >nul 2>&1
if errorlevel 1 (
  start "AP IT System" "%~dp0start-app.cmd"
) else (
  schtasks /Run /TN "AP IT System" >nul
)
echo Updated, and the app is starting again.
exit /b 0

:failed
echo.
echo The update stopped: see the message above. The app is stopped.
echo Once the problem is fixed, run this again, or start the old version with scripts\windows\start-app.cmd.
exit /b 1
