"""POI Tracker — single-window desktop app (no browser).

Runs the FastAPI backend in-process on a local port (it also serves the built
frontend), then opens a native window via pywebview (Edge WebView2 on Windows).
Packaged into one .exe with PyInstaller --onefile by desktop/build.bat.
"""
import logging
import sys
import threading
import time
import traceback
from pathlib import Path

# Dev run: make the backend package importable. When frozen, PyInstaller has
# already collected the `app` package, so no path juggling is needed.
if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import uvicorn  # noqa: E402
import webview  # noqa: E402

HOST = "127.0.0.1"
PORT = 8000
HEALTH_URL = f"http://{HOST}:{PORT}/health"
APP_URL = f"http://localhost:{PORT}"  # matches the frontend's hardcoded API base


def _log_path() -> Path:
    base = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
    return base / "poi-tracker.log"


logging.basicConfig(
    filename=str(_log_path()),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("poi-desktop")

_server_error = {"trace": None}


def _run_server() -> None:
    try:
        from app.main import app  # imported here so the server thread owns it

        config = uvicorn.Config(app, host=HOST, port=PORT, log_level="warning")
        server = uvicorn.Server(config)
        # We're not on the main thread, so uvicorn must not try to install signal
        # handlers (that raises "signal only works in main thread").
        server.install_signal_handlers = lambda: None
        log.info("starting uvicorn on %s:%s", HOST, PORT)
        server.run()
    except Exception:
        _server_error["trace"] = traceback.format_exc()
        log.error("server thread crashed:\n%s", _server_error["trace"])


def _wait_until_up(timeout: float = 30.0) -> bool:
    import urllib.error
    import urllib.request

    deadline = time.time() + timeout
    while time.time() < deadline:
        if _server_error["trace"]:
            return False
        try:
            with urllib.request.urlopen(HEALTH_URL, timeout=1) as r:
                if r.status == 200:
                    return True
        except (urllib.error.URLError, ConnectionError, OSError):
            time.sleep(0.4)
    return False


def main() -> int:
    log.info("POI Tracker desktop starting (frozen=%s)", getattr(sys, "frozen", False))
    threading.Thread(target=_run_server, daemon=True).start()

    if not _wait_until_up():
        detail = _server_error["trace"] or "Backend did not respond in time."
        log.error("startup failed: %s", detail)
        webview.create_window(
            "POI Tracker — startup error",
            html=(
                "<body style='font-family:sans-serif;background:#0b0e14;color:#e8e8e3;padding:24px'>"
                "<h2>Backend failed to start</h2>"
                "<p>Make sure the MetaTrader 5 terminal is running and logged in, then reopen.</p>"
                f"<pre style='white-space:pre-wrap;color:#f87171;font-size:12px'>{detail}</pre>"
                f"<p style='color:#888'>Log: {_log_path()}</p></body>"
            ),
            width=720,
            height=520,
        )
        webview.start()
        return 1

    log.info("backend up; opening window")
    webview.create_window(
        "POI Tracker",
        APP_URL,
        width=1500,
        height=950,
        min_size=(1100, 700),
    )
    webview.start()  # blocks until the window is closed; daemon server thread exits with the process
    return 0


if __name__ == "__main__":
    sys.exit(main())
