"""
Execution guard for MT5 trading operations.

Implements dual authorization pattern:
1. UI "ARMED" toggle (passed in request)
2. Backend EXECUTION_ENABLED flag

All order execution must pass both checks.
"""
from app.config import settings


class ExecutionGuard:
    """Global execution safety guard."""

    def __init__(self):
        self._ui_armed = False

    def is_execution_allowed(self, ui_armed: bool = False) -> tuple[bool, str]:
        """
        Check if execution is allowed based on dual authorization.

        Args:
            ui_armed: Whether the UI "ARMED" toggle is enabled

        Returns:
            Tuple of (allowed: bool, reason: str)
        """
        # Check backend flag
        if not settings.execution_enabled:
            return False, "Backend execution is disabled (EXECUTION_ENABLED=false)"

        # Check UI flag (use stored state if not provided)
        ui_check = ui_armed if ui_armed else self._ui_armed
        if not ui_check:
            return False, "UI is not armed (ARMED toggle disabled)"

        return True, "Execution authorized"

    def set_execution_enabled(self, enabled: bool):
        """Set the global execution flag (admin function)."""
        settings.execution_enabled = enabled

    def toggle(self, ui_armed: bool):
        """Toggle the UI armed status (stored in memory)."""
        self._ui_armed = ui_armed

    def get_execution_status(self) -> dict:
        """Get current execution status."""
        return {
            "backend_enabled": settings.execution_enabled,
            "execution_allowed": settings.execution_enabled
        }


# Singleton instance
execution_guard = ExecutionGuard()