@echo off
setlocal
cd /d "%~dp0"
set "MODE=%~1"
if "%MODE%"=="" set "MODE=local"
node scripts\local\launcher.mjs install %MODE%
echo.
if errorlevel 1 echo Installation did not complete. Read the message above.
pause
