@echo off
rem Stops the AP IT System started by start-app.cmd (or by its task), so it is not started again.
setlocal
cd /d "%~dp0..\.."
if not exist logs mkdir logs
echo stop> logs\stop.flag
schtasks /End /TN "AP IT System" >nul 2>&1
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3200 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { taskkill /PID $_.OwningProcess /T /F | Out-Null }"
echo The app is stopped.
