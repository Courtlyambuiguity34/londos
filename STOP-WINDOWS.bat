@echo off
setlocal
cd /d "%~dp0"
set "MODE=%~1"
if "%MODE%"=="" set "MODE=local"
node scripts\local\launcher.mjs stop %MODE%
echo.
pause
