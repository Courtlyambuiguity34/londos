@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local\build-windows-launchers.ps1"
set "BUILD_EXIT=%ERRORLEVEL%"
echo.
if not "%BUILD_EXIT%"=="0" (
  echo Launcher packaging did not complete. The existing BAT launchers were not changed.
  pause
  exit /b %BUILD_EXIT%
)
echo Windows launchers are ready in %~dp0Londos-Launchers
pause
exit /b 0
