"""POI Tracker desktop launcher.

Spawns the existing backend (FastAPI) and frontend (Vite dev) servers, opens
the default browser, and tears them down cleanly on exit. Built into a
single Windows .exe via launcher/build.bat.
"""
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

# Resolved at build time. If you move the repo, edit this and rebuild.
PROJECT_ROOT = Path(r"C:\Users\Admin\Desktop\POI Tracker")
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend"
VENV_PYTHON = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
NODE_MODULES = FRONTEND_DIR / "node_modules"

BACKEND_HEALTH = "http://127.0.0.1:8000/health"
FRONTEND_URL = "http://localhost:5173"
BANNER = "=" * 56 + "\n  POI Tracker - Trade Planner\n" + "=" * 56


def wait_for(url: str, timeout: float) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as r:
                if r.status == 200:
                    return True
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            pass
        time.sleep(0.5)
    return False


def kill_tree(pid: int) -> None:
    subprocess.run(
        ["taskkill", "/F", "/T", "/PID", str(pid)],
        capture_output=True,
        check=False,
    )


def main() -> int:
    print(BANNER, flush=True)

    if not VENV_PYTHON.exists():
        print(f"\nERROR: venv missing at {VENV_PYTHON}")
        input("\nPress Enter to exit...")
        return 1
    if not NODE_MODULES.exists():
        print(f"\nERROR: frontend deps missing - run `npm install` in {FRONTEND_DIR}")
        input("\nPress Enter to exit...")
        return 1

    flags = (
        subprocess.CREATE_NEW_PROCESS_GROUP
        if hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP")
        else 0
    )

    print("\n[1/3] Starting backend (FastAPI on :8000)...", flush=True)
    backend = subprocess.Popen(
        [str(VENV_PYTHON), "run.py"],
        cwd=str(BACKEND_DIR),
        creationflags=flags,
    )
    if not wait_for(BACKEND_HEALTH, 20):
        print("ERROR: backend failed to start. Is the MT5 terminal running?")
        kill_tree(backend.pid)
        input("\nPress Enter to exit...")
        return 1
    print("       backend ready")

    print("[2/3] Starting frontend (Vite on :5173)...", flush=True)
    try:
        frontend = subprocess.Popen(
            ["npm.cmd", "run", "dev"],
            cwd=str(FRONTEND_DIR),
            shell=True,
            creationflags=flags,
        )
    except FileNotFoundError:
        print("ERROR: `npm` not found on PATH. Install Node.js and retry.")
        kill_tree(backend.pid)
        input("\nPress Enter to exit...")
        return 1

    if not wait_for(FRONTEND_URL, 30):
        print("ERROR: frontend failed to start.")
        kill_tree(backend.pid)
        kill_tree(frontend.pid)
        input("\nPress Enter to exit...")
        return 1
    print("       frontend ready")

    print("[3/3] Opening browser...", flush=True)
    webbrowser.open(FRONTEND_URL)
    print(f"\nApp running at {FRONTEND_URL}")
    print("Close this window to stop the app.\n", flush=True)

    try:
        while True:
            if backend.poll() is not None:
                print("\nBackend exited unexpectedly.")
                break
            if frontend.poll() is not None:
                print("\nFrontend exited unexpectedly.")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...", flush=True)
    finally:
        kill_tree(backend.pid)
        kill_tree(frontend.pid)
        print("Stopped.", flush=True)
        time.sleep(2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
