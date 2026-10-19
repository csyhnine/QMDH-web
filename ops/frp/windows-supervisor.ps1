# Installed in the ACL-protected C:\ProgramData\QMDH-FRP directory.
# Run by an AtStartup scheduled task as SYSTEM; no interactive window/password.
$ErrorActionPreference = 'Stop'
$runtime = $PSScriptRoot
$comfyRoot = 'D:\ComfyUI-aki-v2\ComfyUI'
$pythonExe = 'D:\ComfyUI-aki-v2\python\python.exe'
$frpcExe = Join-Path $runtime 'frpc.exe'
$config = Join-Path $runtime 'windows.toml'
$logRoot = Join-Path $runtime 'logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$runtimeEnv = Join-Path $runtime 'comfy-environment.json'
if (Test-Path -LiteralPath $runtimeEnv) {
    (Get-Content -LiteralPath $runtimeEnv -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object {
        [Environment]::SetEnvironmentVariable($_.Name, [string]$_.Value, 'Process')
    }
}
$mutex = New-Object System.Threading.Mutex($false, 'Global\QMDH-Comfy-Supervisor')
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
    while ($true) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 8188 -ErrorAction SilentlyContinue)
        $unsafeListener = @($listeners | Where-Object { $_.LocalAddress -notin @('127.0.0.1', '::1') }).Count -gt 0
        $initializing = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.ExecutablePath -eq $pythonExe -and $_.CommandLine -like "*$(Join-Path $comfyRoot 'main.py')*" })
        if ($listeners.Count -eq 0 -and $initializing.Count -eq 0) {
            Start-Process -FilePath $pythonExe -WorkingDirectory $comfyRoot -ArgumentList @(
                (Join-Path $comfyRoot 'main.py'), '--listen', '127.0.0.1', '--preview-method', 'auto', '--cuda-malloc'
            ) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot "$stamp-comfy.out.log") -RedirectStandardError (Join-Path $logRoot "$stamp-comfy.err.log") | Out-Null
            # Initialization can take time; don't spawn a second process meanwhile.
            Start-Sleep -Seconds 45
        }
        $client = @(Get-CimInstance Win32_Process -Filter "Name='frpc.exe'" | Where-Object { $_.ExecutablePath -eq $frpcExe -and $_.CommandLine -like "*$config*" })
        if ($client.Count -eq 0 -and -not $unsafeListener) {
            Start-Process -FilePath $frpcExe -ArgumentList @('-c', $config) -WorkingDirectory $runtime -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot "$stamp-frpc.out.log") -RedirectStandardError (Join-Path $logRoot "$stamp-frpc.err.log") | Out-Null
        }
        $ready = $false
        try { $null = Invoke-RestMethod -Uri 'http://127.0.0.1:8188/system_stats' -TimeoutSec 5; $ready = $true } catch { }
        $certificate = Join-Path $runtime 'windows.crt'
        $daysLeft = $null
        if (Test-Path -LiteralPath $certificate) {
            $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certificate)
            $daysLeft = [math]::Floor(($cert.NotAfter - (Get-Date)).TotalDays)
        }
        @{ checked_at = (Get-Date).ToUniversalTime().ToString('o'); local_ready = $ready;
           unsafe_listener = $unsafeListener; certificate_days_left = $daysLeft; renewal_due = ($null -ne $daysLeft -and $daysLeft -lt 30) } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'health.json') -Encoding UTF8
        # Bounded old log retention; private keys/config are never in this folder.
        Get-ChildItem -LiteralPath $logRoot -Filter '*.log' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -Force
        Start-Sleep -Seconds 15
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
