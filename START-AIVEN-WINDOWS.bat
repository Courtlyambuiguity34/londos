@echo off
setlocal
set "LONDOS_REQUIRE_HOSTED_DATABASE=true"
set "ROLE=%~1"
if "%ROLE%"=="" set "ROLE=mall"
call "%~dp0START-WINDOWS.bat" server "%ROLE%"
