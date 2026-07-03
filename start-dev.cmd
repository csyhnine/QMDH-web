@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "BACKEND_PY=%BACKEND_DIR%\.venv\Scripts\python.exe"

if not defined QMDH_BACKEND_PORT set "QMDH_BACKEND_PORT=18010"
if not defined QMDH_FRONTEND_PORT set "QMDH_FRONTEND_PORT=18080"

if "%~1"=="--check" goto check
if "%~1"=="--backend" goto backend
if "%~1"=="--frontend" goto frontend

call :check_prerequisites
if errorlevel 1 (
  echo.
  echo Start aborted. Fix the messages above, then run start-dev.cmd again.
  pause
  exit /b 1
)

call :cleanup_qmdh_dev_processes
if errorlevel 1 (
  echo.
  echo Unable to clean stale QMDH dev processes.
  pause
  exit /b 1
)

call :ensure_target_ports_available
if errorlevel 1 (
  echo.
  echo Start aborted. Free the occupied ports above, then run start-dev.cmd again.
  pause
  exit /b 1
)

echo Starting QMDH backend on http://127.0.0.1:%QMDH_BACKEND_PORT% ...
start "QMDH Backend :%QMDH_BACKEND_PORT%" /D "%ROOT%" "%ComSpec%" /k ""%~f0" --backend"

echo Starting QMDH frontend on http://127.0.0.1:%QMDH_FRONTEND_PORT% ...
start "QMDH Frontend :%QMDH_FRONTEND_PORT%" /D "%ROOT%" "%ComSpec%" /k ""%~f0" --frontend"

echo.
echo QMDH dev servers are starting in two separate windows:
echo   Backend:  http://127.0.0.1:%QMDH_BACKEND_PORT%/api/v1/health
echo   Frontend: http://127.0.0.1:%QMDH_FRONTEND_PORT%
echo   Canonical local dev chain: http://127.0.0.1:%QMDH_FRONTEND_PORT% -> http://127.0.0.1:%QMDH_BACKEND_PORT%
echo.
echo If login shows "Failed to fetch", check the Backend window for errors.
echo Common fix: set QMDH_MEILISEARCH_ENABLED=false when Meilisearch is not running.
echo If Chat shows 500 errors, run database migrations:
echo   cd /d "%BACKEND_DIR%"
echo   .venv\Scripts\python.exe -m alembic upgrade head
echo.
echo Close those two windows to stop the dev servers.
exit /b 0

:check
call :check_prerequisites
if errorlevel 1 exit /b 1
echo All local dev prerequisites look ready.
exit /b 0

:backend
call :check_backend
if errorlevel 1 (
  echo.
  echo Backend start aborted.
  exit /b 1
)
cd /d "%BACKEND_DIR%"
set "PYTHONUTF8=1"
echo Backend working directory: %CD%
echo Running: "%BACKEND_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port %QMDH_BACKEND_PORT% --reload
"%BACKEND_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port %QMDH_BACKEND_PORT% --reload
exit /b %errorlevel%

:frontend
call :check_frontend
if errorlevel 1 (
  echo.
  echo Frontend start aborted.
  exit /b 1
)
cd /d "%FRONTEND_DIR%"
set "VITE_API_PROXY_TARGET=http://127.0.0.1:%QMDH_BACKEND_PORT%"
echo Frontend working directory: %CD%
echo Running: npm run dev -- --host 127.0.0.1 --port %QMDH_FRONTEND_PORT%
npm run dev -- --host 127.0.0.1 --port %QMDH_FRONTEND_PORT%
exit /b %errorlevel%

:check_prerequisites
call :check_backend
if errorlevel 1 exit /b 1
call :check_frontend
if errorlevel 1 exit /b 1
exit /b 0

:check_backend
if not exist "%BACKEND_PY%" (
  echo Missing backend virtualenv Python:
  echo   %BACKEND_PY%
  echo Create it with:
  echo   cd /d "%BACKEND_DIR%"
  echo   python -m venv .venv
  echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
  exit /b 1
)

"%BACKEND_PY%" -c "import uvicorn" >nul 2>nul
if errorlevel 1 (
  echo Backend dependency uvicorn is not installed in:
  echo   %BACKEND_PY%
  echo Install backend dependencies with:
  echo   cd /d "%BACKEND_DIR%"
  echo   .venv\Scripts\python.exe -m pip install -r requirements.txt
  exit /b 1
)

exit /b 0

:check_frontend
if not exist "%FRONTEND_DIR%\package.json" (
  echo Missing frontend package.json:
  echo   %FRONTEND_DIR%\package.json
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not available in PATH. Install Node.js, then retry.
  exit /b 1
)

if not exist "%FRONTEND_DIR%\node_modules" (
  echo Missing frontend dependencies:
  echo   %FRONTEND_DIR%\node_modules
  echo Install them with:
  echo   cd /d "%FRONTEND_DIR%"
  echo   npm install
  exit /b 1
)

if not exist "%FRONTEND_DIR%\node_modules\.bin\vite.cmd" (
  echo Frontend dependencies look incomplete or corrupted:
  echo   %FRONTEND_DIR%\node_modules\.bin\vite.cmd
  echo Repair them with:
  echo   cd /d "%FRONTEND_DIR%"
  echo   npm install
  exit /b 1
)

exit /b 0

:cleanup_qmdh_dev_processes
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$repo = [System.IO.Path]::GetFullPath('%ROOT%').TrimEnd('\');" ^
  "$backend = [System.IO.Path]::GetFullPath('%BACKEND_DIR%').TrimEnd('\');" ^
  "$frontend = [System.IO.Path]::GetFullPath('%FRONTEND_DIR%').TrimEnd('\');" ^
  "$repoPaths = @($repo, $backend, $frontend);" ^
  "$candidatePorts = @(5180, 8000, 18010, 18011, 18080, 19010);" ^
  "$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $candidatePorts -contains $_.LocalPort };" ^
  "$targets = foreach ($listener in $listeners) {" ^
  "  $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess) -ErrorAction SilentlyContinue;" ^
  "  if (-not $process) { continue }" ^
  "  $commandLine = if ($process.CommandLine) { $process.CommandLine } else { '' };" ^
  "  $exePath = if ($process.ExecutablePath) { $process.ExecutablePath } else { '' };" ^
  "  $repoOwned = $false;" ^
  "  foreach ($path in $repoPaths) {" ^
  "    if ($commandLine -like ('*' + $path + '*') -or $exePath -like ('*' + $path + '*')) { $repoOwned = $true; break }" ^
  "  }" ^
  "  if (-not $repoOwned) { continue }" ^
  "  $isDevServer = ($commandLine -match 'uvicorn\s+app\.main:app') -or ($commandLine -match 'vite(\.js)?') -or ($commandLine -match 'npm(\.cmd)?\s+run\s+dev');" ^
  "  if (-not $isDevServer) { continue }" ^
  "  [PSCustomObject]@{ ProcessId = $process.ProcessId; Name = $process.Name; LocalPort = $listener.LocalPort }" ^
  "};" ^
  "$targets = @($targets | Sort-Object ProcessId -Unique | Sort-Object ProcessId -Descending);" ^
  "if ($targets.Count -eq 0) { exit 0 }" ^
  "foreach ($target in $targets) {" ^
  "  Write-Host ('Stopping stale QMDH dev process PID ' + $target.ProcessId + ' on port ' + $target.LocalPort + ' (' + $target.Name + ') ...');" ^
  "  Stop-Process -Id $target.ProcessId -Force -ErrorAction Stop;" ^
  "}" ^
  "Start-Sleep -Milliseconds 750;" ^
  "exit 0"
exit /b %errorlevel%

:ensure_target_ports_available
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$ports = @(%QMDH_BACKEND_PORT%, %QMDH_FRONTEND_PORT%);" ^
  "$blocked = foreach ($port in $ports) {" ^
  "  $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1;" ^
  "  if (-not $listener) { continue }" ^
  "  $process = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess) -ErrorAction SilentlyContinue;" ^
  "  [PSCustomObject]@{" ^
  "    Port = $port;" ^
  "    ProcessId = $listener.OwningProcess;" ^
  "    Name = if ($process) { $process.Name } else { 'unknown' };" ^
  "    CommandLine = if ($process -and $process.CommandLine) { $process.CommandLine } else { '' }" ^
  "  }" ^
  "};" ^
  "$blocked = @($blocked);" ^
  "if ($blocked.Count -eq 0) { exit 0 }" ^
  "foreach ($item in $blocked) {" ^
  "  Write-Host ('Port ' + $item.Port + ' is already in use by PID ' + $item.ProcessId + ' (' + $item.Name + ').');" ^
  "  if ($item.CommandLine) { Write-Host ('  ' + $item.CommandLine) }" ^
  "}" ^
  "exit 1"
exit /b %errorlevel%
