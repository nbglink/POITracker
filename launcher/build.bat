@echo off
setlocal
cd /d "%~dp0\.."
echo Building POI Tracker launcher...

if not exist ".venv\Scripts\python.exe" (
  echo ERROR: venv not found at .venv\Scripts\python.exe
  exit /b 1
)

REM Install PyInstaller into the existing venv (idempotent).
.venv\Scripts\python.exe -m pip install --quiet pyinstaller==6.11.1
if errorlevel 1 ( echo pip install failed & exit /b 1 )

REM Build single-file exe. Console window stays open to show status.
.venv\Scripts\python.exe -m PyInstaller ^
  --onefile ^
  --name "POI Tracker" ^
  --distpath "launcher\dist" ^
  --workpath "launcher\build" ^
  --specpath "launcher" ^
  --console ^
  launcher\launcher.py
if errorlevel 1 ( echo PyInstaller failed & exit /b 1 )

REM Copy to user's desktop.
copy /Y "launcher\dist\POI Tracker.exe" "%USERPROFILE%\Desktop\POI Tracker.exe" >nul
if errorlevel 1 ( echo Copy to desktop failed & exit /b 1 )

echo.
echo SUCCESS: "POI Tracker.exe" placed on your Desktop.
endlocal
