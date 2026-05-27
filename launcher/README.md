# Launcher

A small Python program packaged into a single Windows `.exe` that boots POI Tracker
on double-click. It spawns the existing backend (`python backend/run.py`) and
frontend (`npm run dev`), waits for both to come up, opens your default browser
to `http://localhost:5173`, and tears them down cleanly when you close the
launcher window.

## Build

From the repo root:

```bat
launcher\build.bat
```

That will:

1. Install `pyinstaller==6.11.1` into the existing `.venv` (idempotent).
2. Bundle [launcher.py](launcher.py) into `launcher\dist\POI Tracker.exe`.
3. Copy the `.exe` to `%USERPROFILE%\Desktop\POI Tracker.exe`.

Cold start of the `.exe` is ~1 s (PyInstaller `--onefile` unpacks to `%TEMP%`).

## Editing the app

Editing source code does NOT require rebuilding the launcher.

- **Backend changes** (any `backend/` Python file): close the launcher window,
  double-click the desktop icon again. Uvicorn restarts in < 2 s.
- **Frontend changes** (any `frontend/src/` file): just save. Vite HMR updates
  the browser instantly while the launcher is still running.

You only rebuild the launcher (`launcher\build.bat`) when you change
[launcher.py](launcher.py) itself.

## If you move the project

The launcher has the project path hardcoded at the top of `launcher.py`:

```python
PROJECT_ROOT = Path(r"C:\Users\Admin\Desktop\POI Tracker")
```

Edit that line, run `launcher\build.bat` again, done.

## Troubleshooting

- **"Backend failed to start (is MT5 running?)"** — open the MetaTrader 5
  terminal and log in, then relaunch.
- **Port already in use** — a previous run didn't shut down cleanly. Run:
  ```bat
  taskkill /IM python.exe /F
  taskkill /IM node.exe /F
  ```
  then double-click again.
- **Console window closed unexpectedly** — child processes may leak. Same
  recovery as above.
- **`npm` not found** — install Node.js 18+ and ensure it's on PATH.

## What's gitignored

```
launcher/build/
launcher/dist/
launcher/*.spec
```

The `.exe` itself is not committed; rebuild it on each machine via
`launcher\build.bat`.
