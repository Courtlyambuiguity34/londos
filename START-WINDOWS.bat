@echo off
cd /d "%~dp0"
set "MODE=%~1"
if "%MODE%"=="" set "MODE=preview"
node scripts\local\launcher.mjs start %MODE%
if errorlevel 1 pause
