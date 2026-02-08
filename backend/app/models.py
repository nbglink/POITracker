"""
Pydantic models for MT5 Risk-Based Trade Planner API.

Defines input/output schemas for risk calculations and MT5 operations.
"""
from pydantic import BaseModel, Field, model_validator
from typing import Optional
from enum import Enum


class TradeDirection(str, Enum):
    BUY = "buy"
    SELL = "sell"


class RiskCalcInput(BaseModel):
    """Input parameters for risk/volume calculation."""
    account_balance: float = Field(..., gt=0, description="Account balance in account currency")
    risk_percent: float = Field(..., gt=0, le=100, description="Risk percentage (0-100)")
    symbol: str = Field(..., description="Trading symbol (e.g., XAUUSD)")
    direction: TradeDirection = Field(..., description="Trade direction")
    entry_price: float = Field(..., gt=0, description="Entry price")
    stop_pips: float = Field(..., gt=0, description="Stop loss distance in pips")
    max_stop_pips: float = Field(..., gt=0, description="Maximum allowed stop distance")
    tp1_pips: Optional[float] = Field(None, ge=0, description="Take profit 1 distance in pips")
    partial_percent: float = Field(default=50.0, ge=0, le=100, description="Partial close percentage at TP1")
    move_to_be_enabled: bool = Field(default=True, description="Move SL to break-even after TP1")
    be_buffer_pips: float = Field(default=0.0, ge=0, description="Buffer pips for break-even SL")
    pip_value_per_1_lot: float = Field(..., gt=0, description="Pip value per 1.0 lot in account currency")
    min_volume: float = Field(default=0.01, gt=0, description="Broker minimum volume")
    volume_step: float = Field(default=0.01, gt=0, description="Broker volume step")


class RiskCalcOutput(BaseModel):
    """Output from risk/volume calculation."""
    allowed: bool = Field(..., description="Whether trade is allowed based on max stop rule")
    volume_raw: float = Field(..., description="Calculated volume before broker constraints")
    volume: float = Field(..., description="Final volume after broker constraints")
    target_risk_amount: float = Field(..., description="Target risk in account currency")
    actual_risk_amount: float = Field(..., description="Actual risk based on final volume")
    target_risk_percent: float = Field(..., description="Target risk as percentage")
    actual_risk_percent: float = Field(..., description="Actual risk as percentage of balance")
    tp1_pips: Optional[float] = Field(None, description="TP1 distance in pips")
    partial_percent: float = Field(..., description="Partial close percentage at TP1")
    remaining_volume: float = Field(..., description="Volume remaining after partial close")
    be_sl_price: Optional[float] = Field(None, description="Break-even SL price if enabled")
    warnings: list[str] = Field(default_factory=list, description="Risk warnings and alerts")


class MT5Status(BaseModel):
    """MT5 connection and trading status."""
    connected: bool = Field(..., description="Whether MT5 terminal is connected")
    terminal_connected: bool = Field(default=False, description="Physical connection to server")
    terminal_trade_allowed: bool = Field(default=False, description="Terminal trade allowed")
    account_trade_allowed: bool = Field(default=False, description="Account trade allowed")
    account_info: Optional[dict] = Field(None, description="Account information")
    terminal_info: Optional[dict] = Field(None, description="Terminal information")
    last_error: Optional[str] = Field(None, description="Last MT5 error message")


class ArmedStatusRequest(BaseModel):
    """Request to set UI armed status."""
    armed: bool = Field(..., description="UI armed state")


class OrderRequest(BaseModel):
    """Request to place a market or limit order."""
    symbol: str = Field(..., description="Trading symbol")
    direction: TradeDirection = Field(..., description="Trade direction")
    volume: float = Field(..., gt=0, description="Order volume")
    price: Optional[float] = Field(None, description="Limit order price (None for market)")
    sl_price: Optional[float] = Field(None, description="Stop loss price")
    tp_price: Optional[float] = Field(None, description="Take profit price")
    ui_armed: bool = Field(default=False, description="UI armed status for execution guard")


class PartialCloseRequest(BaseModel):
    """Request to partially close a position.

    Preferred (strategy): {position_ticket, percent, ui_armed}
    Legacy: {ticket, volume, ui_armed}
    """

    # Preferred
    position_ticket: Optional[int] = Field(None, description="Position ticket number")
    percent: Optional[float] = Field(None, gt=0, le=100, description="Percent of position to close")

    # Legacy
    ticket: Optional[int] = Field(None, description="(Legacy) Position ticket number")
    volume: Optional[float] = Field(None, gt=0, description="(Legacy) Volume to close")

    ui_armed: bool = Field(default=False, description="UI armed status for execution guard")

    @model_validator(mode="after")
    def _validate_partial_close(self):
        if self.position_ticket is None and self.ticket is None:
            raise ValueError("partial-close requires position_ticket (preferred) or ticket (legacy)")

        if self.percent is None and self.volume is None:
            raise ValueError("partial-close requires percent (preferred) or volume (legacy)")

        return self


class ModifySLRequest(BaseModel):
    """Request to modify stop loss."""
    ticket: int = Field(..., description="Position ticket number")
    sl_price: float = Field(..., description="New stop loss price")
    ui_armed: bool = Field(default=False, description="UI armed status for execution guard")


class OrderResponse(BaseModel):
    """Response from order operations."""
    success: bool = Field(..., description="Whether operation succeeded")
    ticket: Optional[int] = Field(None, description="Order/position ticket if successful")
    order_ticket: Optional[int] = Field(None, description="Order ticket if available")
    position_ticket: Optional[int] = Field(None, description="Position ticket if available")
    error: Optional[str] = Field(None, description="Error message if failed")


class PartialCloseResponse(OrderResponse):
    """Partial close response with normalization details."""

    position_ticket: Optional[int] = None
    symbol: Optional[str] = None
    position_volume: Optional[float] = None
    percent: Optional[float] = None
    requested_volume: Optional[float] = None
    close_volume: Optional[float] = None
    remaining_volume: Optional[float] = None
    blocked_reason: Optional[str] = None
    volume_min: Optional[float] = None
    volume_step: Optional[float] = None
    mt5_retcode: Optional[int] = None
    mt5_comment: Optional[str] = None


class OpenPositionInfo(BaseModel):
    """Raw snapshot of an open MT5 position (magic-filtered)."""
    ticket: int
    symbol: str
    type: int
    volume: float
    price_open: float
    sl: Optional[float] = None
    tp: Optional[float] = None
    magic: int
    comment: Optional[str] = None
    time: Optional[int] = None


class PositionInfo(BaseModel):
    """Snapshot of an open position."""
    position_ticket: int
    symbol: str
    direction: TradeDirection
    volume: float
    price_open: float
    sl: Optional[float] = None
    tp: Optional[float] = None
    digits: int
    pip_in_price: float
    volume_min: float
    volume_step: float


class PositionResponse(BaseModel):
    """Response for position lookup/resolve."""
    success: bool
    position: Optional[PositionInfo] = None
    error: Optional[str] = None


class MoveSLToBERequest(BaseModel):
    """(Legacy) Request to move SL to break-even using the true position entry price."""
    ticket: int = Field(..., description="Order or position ticket")
    be_buffer_pips: float = Field(default=0.0, ge=0, description="Buffer pips beyond entry")
    ui_armed: bool = Field(default=False, description="UI armed status for execution guard")


class MoveToBERequest(BaseModel):
    """Request to move SL to true BE derived from MT5 position.price_open."""
    position_ticket: int = Field(..., description="Position ticket number")
    buffer_pips: float = Field(default=0.0, ge=0, description="Optional BE buffer in pips")
    ui_armed: bool = Field(default=False, description="UI armed status for execution guard")


class TP1ManageRequest(BaseModel):
    """Request to execute TP1 management: partial close + move SL to BE."""
    ticket: int = Field(..., description="Order or position ticket")
    partial_percent: float = Field(default=50.0, gt=0, le=100, description="Percent of position to close")
    move_to_be_enabled: bool = Field(default=True, description="Whether to move SL to BE after partial close")
    be_buffer_pips: float = Field(default=0.0, ge=0, description="Buffer pips for BE SL")
    ui_armed: bool = Field(default=False, description="UI armed status for execution guard")


class TP1ManageResponse(BaseModel):
    """Response for TP1 management."""
    success: bool
    position_ticket: Optional[int] = None
    closed_volume_requested: Optional[float] = None
    closed_volume_normalized: Optional[float] = None
    sl_price_set: Optional[float] = None
    error: Optional[str] = None


class TP1WatcherRequest(BaseModel):
    """Request to start/stop the backend TP1 watcher."""
    enabled: bool = Field(..., description="True to start, False to stop")
    ui_armed: bool = Field(default=False, description="UI armed status for execution guard")


class TP1WatcherResponse(BaseModel):
    """Response from TP1 watcher control endpoint."""
    running: bool
    locked: bool = False
    pid: Optional[int] = None
    reason: Optional[str] = None
    message: Optional[str] = None