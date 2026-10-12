@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local\install-on-d.ps1" -SourceRoot "%~dp0"
set "INSTALL_EXIT=%ERRORLEVEL%"
if not "%INSTALL_EXIT%"=="0" (
  echo.
  echo D-drive installation did not complete. Nothing in a non-empty D:\Londos was overwritten.
  pause
)
exit /b %INSTALL_EXIT%
