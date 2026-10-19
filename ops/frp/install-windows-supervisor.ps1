# Run this saved script in an Administrator PowerShell after runtime preparation.
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'An elevated Administrator PowerShell is required to install the SYSTEM startup task and firewall rule.'
}
$runtime = 'C:\ProgramData\QMDH-FRP'
& (Join-Path $runtime 'frpc.exe') verify -c (Join-Path $runtime 'windows.toml')
if ($LASTEXITCODE -ne 0) { throw 'FRP configuration verification failed.' }
$action = New-ScheduledTaskAction -Execute 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -Argument '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File C:\ProgramData\QMDH-FRP\windows-supervisor.ps1'
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'QMDH-Comfy-Supervisor' -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $settings -Principal $principal -Description 'Supervise loopback-only ComfyUI and authenticated FRP' -Force | Out-Null
if (-not (Get-NetFirewallRule -Name 'QMDH-Comfy-Block-Inbound' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name 'QMDH-Comfy-Block-Inbound' -DisplayName 'QMDH block remote ComfyUI access' -Direction Inbound -Action Block -Protocol TCP -LocalPort 8188 -Profile Any | Out-Null
}
# Stop only the identified old user watchdog, never the ComfyUI/frpc children.
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object {
    $_.ProcessId -ne $PID -and $_.CommandLine -like '*-File*C:\ProgramData\QMDH-FRP\windows-supervisor.ps1*'
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'QMDH-Comfy-Supervisor' -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName 'QMDH-Comfy-Supervisor'
Get-ScheduledTask -TaskName 'QMDH-Comfy-Supervisor' | Select-Object TaskName, State
