@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "BACKEND_PY=%BACKEND_DIR%\.venv\Scripts\python.exe"

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

echo Starting QMDH backend on http://127.0.0.1:18010 ...
start "QMDH Backend :18010" /D "%ROOT%" "%ComSpec%" /k ""%~f0" --backend"

echo Starting QMDH frontend on http://127.0.0.1:18080 ...
start "QMDH Frontend :18080" /D "%ROOT%" "%ComSpec%" /k ""%~f0" --frontend"

echo.
echo QMDH dev servers are starting in two separate windows:
echo   Backend:  http://127.0.0.1:18010/api/v1/health
echo   Frontend: http://127.0.0.1:18080
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
echo Running: "%BACKEND_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 18010 --reload
"%BACKEND_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 18010 --reload
exit /b %errorlevel%

:frontend
call :check_frontend
if errorlevel 1 (
  echo.
  echo Frontend start aborted.
  exit /b 1
)
cd /d "%FRONTEND_DIR%"
set "VITE_API_PROXY_TARGET=http://127.0.0.1:18010"
echo Frontend working directory: %CD%
echo Running: npm run dev -- --host 127.0.0.1
npm run dev -- --host 127.0.0.1
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

exit /b 0
