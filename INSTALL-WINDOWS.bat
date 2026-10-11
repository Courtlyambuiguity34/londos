@echo off
setlocal
cd /d "%~dp0"
set "MODE=%~1"
if "%MODE%"=="" set "MODE=local"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local\bootstrap-prerequisites.ps1" -Mode "%MODE%"
set "INSTALL_EXIT=%ERRORLEVEL%"
echo.
if not "%INSTALL_EXIT%"=="0" (
  echo Installation did not complete. Read the message above.
  echo A private error summary is kept in .local\logs\windows-install-error.log when possible.
  pause
  exit /b %INSTALL_EXIT%
)
echo Londos installation completed successfully.
pause
exit /b 0
