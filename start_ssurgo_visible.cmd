@echo off
setlocal

set "ROOT=%~dp0"

if /I "%~1"=="--run" goto run

start "SSURGO Portal Visible" cmd /k ""%~f0" --run"
exit /b 0

:run
cd /d "%ROOT%"
set "TARGET=version\SSURGO_Portal-1.0.0.120.cmd"

if not exist "%TARGET%" (
  echo.
  echo ERROR: Cannot find %TARGET%
  echo.
  pause
  exit /b 1
)

echo.
echo Starting SSURGO Portal from %TARGET%
echo.

call "%TARGET%"
set "APP_EXIT=%ERRORLEVEL%"

echo.
echo SSURGO session ended with code %APP_EXIT%.
echo Press any key to close this window.
pause >nul
exit /b %APP_EXIT%
