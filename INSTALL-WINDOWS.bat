@echo off
setlocal
cd /d "%~dp0"
set "MODE=%~1"
if "%MODE%"=="" set "MODE=local"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local\bootstrap-prerequisites.ps1" -Mode "%MODE%"
echo.
if errorlevel 1 echo Installation did not complete. Read the message above.
pause
