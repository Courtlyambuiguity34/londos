@echo off
setlocal
cd /d "%~dp0"
set "MODE=%~1"
if "%MODE%"=="" set "MODE=local"
set "ROLE=%~2"
if "%ROLE%"=="" set "ROLE=mall"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local\run-with-node.ps1" start "%MODE%" "%ROLE%"
if errorlevel 1 (
  echo.
  echo Londos stopped with an error. Read the message above.
  pause
)
