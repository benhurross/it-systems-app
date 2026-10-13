#Requires -RunAsAdministrator
# One-time setup on the computer that runs the AP IT System. In PowerShell opened as administrator
# (signed in to Windows as the person whose account runs the app), from the app folder:
#   powershell -ExecutionPolicy Bypass -File scripts\windows\setup-windows.ps1
# It sets up:
#   - the task "AP IT System": starts the app when you sign in to Windows, and keeps it running
#   - the task "AP IT System backup": a backup every day at 12:30 (or -BackupTime "18:00"), or as
#     soon as the computer is on again if it was off at that time
#   - a Windows Firewall rule so other computers on the network can open the app (port 3200)
#   - no sleeping while plugged in, since a sleeping computer doesn't answer the others
# Running it again replaces the tasks, to change the backup time say.
param([string]$BackupTime = "12:30")
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

# Paths are quoted: the app folder may have spaces in it.
$app = @{
  TaskName    = "AP IT System"
  Description = "Starts the AP IT System web app at sign-in and keeps it running. Log: $root\logs\app.log"
  Action      = New-ScheduledTaskAction -Execute "`"$PSScriptRoot\start-app.cmd`"" -WorkingDirectory $root
  Trigger     = New-ScheduledTaskTrigger -AtLogOn -User $user
  # No time limit: by default Windows stops a task after three days.
  Settings    = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Principal   = $principal
}
Register-ScheduledTask @app -Force | Out-Null

$backup = @{
  TaskName    = "AP IT System backup"
  Description = "Backs up the AP IT System's database, files and settings. Log: $root\logs\backup.log"
  Action      = New-ScheduledTaskAction -Execute "`"$PSScriptRoot\backup.cmd`"" -WorkingDirectory $root
  Trigger     = New-ScheduledTaskTrigger -Daily -At $BackupTime
  Settings    = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Principal   = $principal
}
Register-ScheduledTask @backup -Force | Out-Null

$rule = "AP IT System (port 3200)"
# Every network type: Windows can re-label the office network as Public (after it drops for a
# moment, say), and a rule for Private networks alone would then shut the others out overnight.
if (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue) {
  Set-NetFirewallRule -DisplayName $rule -Profile Any -Action Allow -Enabled True
} else {
  New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort 3200 -Action Allow -Profile Any | Out-Null
}

powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

Write-Host "Set up for $user`:"
Write-Host "  - The app starts when you sign in to Windows (task: AP IT System)."
Write-Host "  - A backup runs every day at $BackupTime (task: AP IT System backup)."
Write-Host "  - Other computers on the network can reach port 3200 (firewall rule: $rule)."
Write-Host "  - This computer no longer sleeps while plugged in (the screen still turns off)."
if (-not (Get-NetTCPConnection -LocalPort 3200 -State Listen -ErrorAction SilentlyContinue)) {
  Start-ScheduledTask -TaskName "AP IT System"
  Write-Host "The app is starting now."
}
