@echo off
rem Runs "npm run backup", adding what it says to logs\backup.log. The "AP IT System backup" task
rem runs this every day (see setup-windows.ps1).
setlocal
cd /d "%~dp0..\.."
if not exist logs mkdir logs
echo.>> logs\backup.log
echo [%date% %time%]>> logs\backup.log
call npm run backup >> logs\backup.log 2>&1
exit /b %errorlevel%
