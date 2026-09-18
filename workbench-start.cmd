@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0workbench-start.ps1" %*
if "%~1"=="" (
  echo.
  pause
)
endlocal
