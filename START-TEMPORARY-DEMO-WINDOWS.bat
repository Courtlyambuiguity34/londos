@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local\temporary-demo.ps1"
set "DEMO_EXIT=%ERRORLEVEL%"
echo.
if not "%DEMO_EXIT%"=="0" (
  echo The temporary demo link stopped with an error. Read the message above.
  pause
  exit /b %DEMO_EXIT%
)
echo The temporary demo link is closed.
pause
exit /b 0
