@echo off
setlocal
set "ACCOUNT_FILE=%~dp0local\qmdh-dev-accounts.md"
if not exist "%ACCOUNT_FILE%" (
  echo Local account archive not found: %ACCOUNT_FILE%
  echo Please ask Codex to regenerate local/qmdh-dev-accounts.md.
  pause
  exit /b 1
)
start "" notepad "%ACCOUNT_FILE%"
