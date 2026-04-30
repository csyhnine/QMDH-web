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

call :choose_backend_port

echo Starting QMDH backend on http://127.0.0.1:%QMDH_BACKEND_PORT% ...
start "QMDH Backend :%QMDH_BACKEND_PORT%" /D "%ROOT%" "%ComSpec%" /k ""%~f0" --backend"

echo Starting QMDH frontend on http://127.0.0.1:%QMDH_FRONTEND_PORT% ...
start "QMDH Frontend :%QMDH_FRONTEND_PORT%" /D "%ROOT%" "%ComSpec%" /k ""%~f0" --frontend"

echo.
echo QMDH dev servers are starting in two separate windows:
echo   Backend:  http://127.0.0.1:%QMDH_BACKEND_PORT%/api/v1/health
echo   Frontend: http://127.0.0.1:%QMDH_FRONTEND_PORT%
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

:choose_backend_port
if not "%QMDH_BACKEND_PORT%"=="18010" exit /b 0
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $providers = Invoke-RestMethod -Uri 'http://127.0.0.1:18010/api/v1/providers' -TimeoutSec 2; $items = @($providers); if ($items.Count -gt 0 -and $items[0].PSObject.Properties.Name -contains 'adapter_kind') { exit 0 }; exit 1 } catch { $tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port 18010 -InformationLevel Quiet; if ($tcp) { exit 1 }; exit 0 }" >nul 2>nul
if errorlevel 1 (
  echo Existing API on 18010 is unavailable or stale; using backend fallback port 18011.
  set "QMDH_BACKEND_PORT=18011"
)
exit /b 0

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

exit /b 0
