"""
Configuration settings for MT5 Risk-Based Trade Planner.

Loads environment variables and provides default values. All settings use the
``MT5_`` prefix (e.g. ``MT5_EXECUTION_ENABLED``).
"""
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings

# backend/.env — resolved absolutely so it loads regardless of the process CWD
# (uvicorn from repo root, run.py from backend/, the launcher, etc.).
_ENV_FILE = str(Path(__file__).resolve().parent.parent / ".env")


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
