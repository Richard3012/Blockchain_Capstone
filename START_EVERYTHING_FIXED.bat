@echo off
setlocal

cd /d "%~dp0"

echo Starting BlockERP full local stack...
echo Frontend will run on http://localhost:3000
echo Backend will run on http://localhost:4000
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-everything.ps1"

endlocal
