"""
Configuration settings for MT5 Risk-Based Trade Planner.

Loads environment variables and provides default values. All settings use the
``MT5_`` prefix (e.g. ``MT5_EXECUTION_ENABLED``).
"""
import sys
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings


def _env_files() -> tuple:
    """Candidate .env paths (later entries win in pydantic-settings).

    - Dev / run.py / uvicorn: backend/.env (absolute, CWD-independent).
    - Packaged desktop .exe: a .env placed next to the executable, so the
      operator can flip MT5_EXECUTION_ENABLED without rebuilding. In a frozen
      build __file__ points inside the temp unpack dir, so backend/.env there
      won't exist — the exe-dir .env is what actually loads.
    """
    files = [str(Path(__file__).resolve().parent.parent / ".env")]
    if getattr(sys, "frozen", False):
        files.append(str(Path(sys.executable).resolve().parent / ".env"))
    return tuple(files)


_ENV_FILE = _env_files()


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # MT5 auto-login (optional)
    mt5_login: Optional[int] = None
    mt5_password: Optional[str] = None
    mt5_server: Optional[str] = None

    # Execution safety
    execution_enabled: bool = False  # Global execution toggle

    # TP1 watcher defaults
    tp1_pips_default: float = 30.0
    tp1_percent_default: float = 50.0
    tp1_be_buffer_pips: float = 0.0
    tp1_poll_interval_s: float = 0.5

    class Config:
        env_file = _ENV_FILE
        env_prefix = "MT5_"
        case_sensitive = False


settings = Settings()
