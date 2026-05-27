@echo off
setlocal
cd /d "%~dp0\.."
set "ROOT=%CD%"
set "VENV_PY=%ROOT%\.venv\Scripts\python.exe"

if not exist "%VENV_PY%" (
  echo ERROR: venv not found at %VENV_PY%
  exit /b 1
)

echo [1/3] Installing build dependencies into .venv...
"%VENV_PY%" -m pip install --quiet pywebview pythonnet "pyinstaller==6.11.1"
if errorlevel 1 goto :err

echo [2/3] Building frontend (npm run build)...
pushd "%ROOT%\frontend"
call npm install
if errorlevel 1 ( popd & goto :err )
call npm run build
if errorlevel 1 ( popd & goto :err )
popd

echo [3/3] Bundling single .exe with PyInstaller (this can take a minute)...
"%VENV_PY%" -m PyInstaller --noconfirm --clean --onefile --windowed ^
  --name "POI Tracker" ^
  --icon "%ROOT%\desktop\icon.ico" ^
  --distpath "%ROOT%\desktop\dist" ^
  --workpath "%ROOT%\desktop\build" ^
  --specpath "%ROOT%\desktop" ^
  --paths "%ROOT%\backend" ^
  --add-data "%ROOT%\frontend\dist;frontend_dist" ^
  --collect-all MetaTrader5 ^
  --collect-all numpy ^
  --collect-all uvicorn ^
  --collect-all webview ^
  --collect-submodules websockets ^
  --collect-submodules app ^
  --hidden-import app.main ^
  "%ROOT%\desktop\poi_desktop.py"
if errorlevel 1 goto :err

echo.
echo DONE -^> "%ROOT%\desktop\dist\POI Tracker.exe"
rem Desktop entry is a shortcut to the built exe (no duplicated copy); icon comes
rem from the exe's embedded resource. Remove any old copied exe from earlier builds.
del "%USERPROFILE%\Desktop\POI Tracker.exe" >nul 2>&1
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $sc=$ws.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\POI Tracker.lnk'); $sc.TargetPath='%ROOT%\desktop\dist\POI Tracker.exe'; $sc.WorkingDirectory='%ROOT%\desktop\dist'; $sc.IconLocation='%ROOT%\desktop\dist\POI Tracker.exe,0'; $sc.Save(); ie4uinit.exe -show"
echo Created Desktop shortcut: "POI Tracker.lnk"
exit /b 0

:err
echo.
echo BUILD FAILED. See the output above.
exit /b 1
