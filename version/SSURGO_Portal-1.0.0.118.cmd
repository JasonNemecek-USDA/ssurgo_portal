@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PYZ=%SCRIPT_DIR%SSURGO_Portal-1.0.0.118.pyz"

if not exist "%PYZ%" (
  echo.
  echo ERROR: Cannot find SSURGO_Portal-1.0.0.118.pyz in:
  echo   %SCRIPT_DIR%
  echo.
  echo Put this .cmd file in the same folder as the .pyz file and try again.
  echo.
  pause
  exit /b 1
)

set "PY_CMD="
for %%V in (3.11 3.10 3.9) do (
  py -%%V -c "import sys" >nul 2>nul
  if not errorlevel 1 (
    set "PY_CMD=py -%%V"
    goto :launch
  )
)

where python >nul 2>nul
if not errorlevel 1 (
  set "PY_CMD=python"
  goto :launch
)

echo.
echo ERROR: Python 3.9, 3.10, or 3.11 was not found.
echo.
echo Install Python 3.11 from https://www.python.org/downloads/windows/
echo and make sure the installer adds Python to PATH.
echo.
pause
exit /b 1

:launch
echo.
echo Starting SSURGO Portal...
echo.

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8083" ^| findstr LISTENING') do (
  taskkill /PID %%P /F >nul 2>nul
)

set "SSURGO_AUTO_INIT=1"
%PY_CMD% "%PYZ%"
set "APP_EXIT=%ERRORLEVEL%"

if not "%APP_EXIT%"=="0" (
  echo.
  echo SSURGO Portal exited with code %APP_EXIT%.
  echo Review the message above for details.
  echo.
  pause
)

endlocal
exit /b %APP_EXIT%

