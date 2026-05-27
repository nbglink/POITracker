# Desktop app (single .exe, native window)

A single Windows `.exe` that bundles the **whole** POI Tracker — FastAPI backend
**and** the built React frontend — and shows it in a **native window** (Edge
WebView2), with **no browser** and no separate dev server.

How it works: the exe starts the FastAPI backend in-process on `127.0.0.1:8000`
(the backend also serves the compiled frontend as static files), then opens a
[pywebview](https://pywebview.flowlight.dev/) window pointed at it. MetaTrader5
runs inside the backend, exactly as before.

This supersedes [`../launcher/`](../launcher), which instead spawned the dev
servers and opened your browser.

## Build

From anywhere:

```bat
desktop\build.bat
```

It will (using the repo's `.venv`):
1. Install build deps (`pywebview`, `pythonnet`, `pyinstaller`) — idempotent.
2. `npm run build` the frontend → `frontend/dist`.
3. Bundle everything with PyInstaller `--onefile --windowed` into
   `desktop\dist\POI Tracker.exe`, and create a **Desktop shortcut**
   (`POI Tracker.lnk`) pointing at it (icon from the exe's embedded resource).

If the Desktop shortcut still shows a stale icon, press **F5** on the Desktop
(Windows icon cache); the build already calls `ie4uinit.exe -show` to nudge it.

First cold start of the `.exe` is a few seconds (PyInstaller `--onefile` unpacks
to `%TEMP%`).

## Requirements

- **Windows 11** (WebView2 runtime is built in; on Windows 10 install the
  "Evergreen WebView2 Runtime" once).
- **MetaTrader 5 terminal running and logged in** before launch (same as the
  rest of the app). Enable **Algo Trading** in the terminal for order execution.
- **`backend/.env`** with `MT5_EXECUTION_ENABLED=true` to allow execution
  (plus the in-app ARMED toggle). Without it the app runs read-only.

## Editing the app → rebuild

Unlike the dev launcher, the exe is a **frozen snapshot** — there is no HMR.
After changing backend or frontend code, run `desktop\build.bat` again to
recompile. (Confirmed acceptable per the project owner.)

## Troubleshooting

- **"Backend failed to start" window** — the error window shows the traceback,
  and the full log is written next to the exe at `poi-tracker.log`. Most often:
  the MT5 terminal isn't running/logged in, or port `8000` is already in use
  (close any `python run.py` / dev backend first).
- **Port 8000 busy** — stop the dev backend; the exe needs that port.

## What's gitignored

```
desktop/build/   desktop/dist/   desktop/*.spec
desktop/poi-tracker.log   desktop/window-capture.png
```

The `.exe` is not committed; rebuild it per machine with `desktop\build.bat`.
