"""
Configuration settings for MT5 Risk-Based Trade Planner.

Loads environment variables and provides default values.
"""
import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # MT5 settings
    mt5_login: Optional[int] = None
    mt5_password: Optional[str] = None
    mt5_server: Optional[str] = None
    mt5_path: Optional[str] = None  # Path to MT5 terminal executable

    # Execution safety
    execution_enabled: bool = False  # Global execution toggle

    # Default broker constraints
    default_min_volume: float = 0.01
    default_volume_step: float = 0.01

    # TP1 watcher defaults
    tp1_pips_default: float = 30.0
    tp1_percent_default: float = 50.0
    tp1_be_buffer_pips: float = 0.0
    tp1_poll_interval_s: float = 0.5

    class Config:
        env_file = ".env"
        env_prefix = "MT5_"
        case_sensitive = False


# Global settings instance
settings = Settings()