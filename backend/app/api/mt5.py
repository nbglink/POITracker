"""
MT5 API endpoints.

Provides endpoints for MT5 connection status, order placement, and position management.
All endpoints require execution authorization.
"""
from fastapi import APIRouter, HTTPException
from app.models import (
    MT5Status, OrderRequest, PartialCloseRequest, ModifySLRequest, OrderResponse,
    PartialCloseResponse,
    ArmedStatusRequest,
    PositionResponse,
    OpenPositionInfo,
    MoveSLToBERequest,
    MoveToBERequest,
    TP1ManageRequest,
    TP1ManageResponse,
    TP1WatcherRequest,
    TP1WatcherResponse,
)
from app.services.mt5_service import mt5_service, tp1_watcher
from app.services.execution_guard import execution_guard
from app.services.pip_specs import pip_in_price_for_symbol, pip_spec_from_mt5
import MetaTrader5 as mt5

router = APIRouter()


def check_execution_auth(ui_armed: bool = False):
    """Dependency to check execution authorization."""
    allowed, reason = execution_guard.is_execution_allowed(ui_armed)
    if not allowed:
        raise HTTPException(status_code=403, detail=f"Execution not authorized: {reason}")
    return True


@router.get("/mt5/status", response_model=MT5Status)
async def get_mt5_status():
    """Get MT5 connection and account status."""
    return mt5_service.get_status()


@router.post("/mt5/execution-enable")
async def set_execution_enabled(request: ArmedStatusRequest):
    """Admin endpoint to enable/disable backend execution flag."""
    execution_guard.set_execution_enabled(request.armed)
    return {"backend_enabled": request.armed}


@router.get("/mt5/armed")
async def get_armed_status():
    """Get current armed status."""
    return {"armed": execution_guard._ui_armed}


@router.get("/mt5/symbols")
async def get_symbols():
    """Return available symbols from the connected MT5 terminal.

    Lazy-initializes MT5, captures last_error, and safely serializes symbol info.
    """
    initialized = False
    last_error_tuple = None
    error_message = None
    
    try:
        initialized = bool(mt5.initialize())
        last_error_tuple = mt5.last_error()
        
        if not initialized and last_error_tuple:
            error_code = last_error_tuple[0] if isinstance(last_error_tuple, tuple) else last_error_tuple
            if error_code == 10017:
                error_message = "MT5 terminal not running or not logged in. Please open MetaTrader 5 and login."
            elif error_code == 10004:
                error_message = "MT5 terminal not accessible. Check if MT5 is running with same user privileges."
            else:
                error_message = f"MT5 initialization failed with error {error_code}"
    except Exception as e:
        initialized = False
        error_message = f"MT5 Python API error: {str(e)}"

    last_error_str = str(last_error_tuple) if last_error_tuple else None
    symbols_list = []

    if initialized:
        try:
            raw = mt5.symbols_get()
            if raw:
                for s in raw:
                    try:
                        # trade_mode: 0=disabled, 1=long only, 2=short only, 3=close only, 4=full trading
                        trade_mode = getattr(s, "trade_mode", 0)
                        name = getattr(s, "name", "") or ""
                        digits = getattr(s, "digits", 0) or 0
                        point = getattr(s, "point", 0) or 0
                        contract_size = getattr(s, "trade_contract_size", 1) or 1

                        # Derive pip/tick specs (exact sizing)
                        pip_in_price = pip_in_price_for_symbol(name, digits)
                        tick_size = float(getattr(s, "trade_tick_size", 0.0) or 0.0)
                        tick_value = float(getattr(s, "trade_tick_value", 0.0) or 0.0)

                        # Prefer symbol_info() for tick_value/tick_size if not present
                        pip_spec = None
                        if tick_size <= 0 or tick_value <= 0:
                            pip_spec = pip_spec_from_mt5(name)
                            if pip_spec:
                                tick_size = pip_spec.tick_size
                                tick_value = pip_spec.tick_value

                        pip_value = 0.0
                        if tick_size > 0 and tick_value > 0:
                            pip_value = (pip_in_price / tick_size) * tick_value

                        # Fallback if MT5 doesn't provide tick value (keeps UI usable)
                        if pip_value <= 0:
                            pip_value = contract_size * pip_in_price
                        
                        symbols_list.append({
                            "name": name,
                            "path": getattr(s, "path", None),
                            "trade_allowed": trade_mode in [1, 2, 4],  # Allow if long, short, or full trading
                            "digits": digits,
                            "point": point,
                            "trade_contract_size": contract_size,
                            "description": getattr(s, "description", None),
                            "pip_in_price": pip_in_price,
                            "tick_size": tick_size,
                            "tick_value": tick_value,
                            "pip_size": pip_in_price,
                            "pip_value_per_lot": pip_value,
                        })
                    except Exception:
                        continue
        except Exception as e:
            error_message = f"Failed to retrieve symbols: {str(e)}"

    return {
        "initialized": initialized,
        "last_error": last_error_str,
        "error_message": error_message,
        "symbols": symbols_list,
        "symbols_count": len(symbols_list),
    }


@router.get("/mt5/diagnostics")
async def mt5_diagnostics():
    """Return diagnostics for debugging MT5 connectivity and environment."""
    import platform

    # Attempt to (re)initialize MT5 and capture result
    try:
        init_result = bool(mt5.initialize())
    except Exception:
        init_result = False

    last_err = mt5.last_error()

    # Terminal and account info if available
    terminal_info = None
    account_info = None
    try:
        term = mt5.terminal_info()
        terminal_info = term._asdict() if term else None
    except Exception:
        terminal_info = None

    try:
        acc = mt5.account_info()
        account_info = acc._asdict() if acc else None
    except Exception:
        account_info = None

    return {
        "python_version": platform.python_version(),
        "python_arch": platform.architecture(),
        "mt5_initialize": init_result,
        "mt5_last_error": str(last_err) if last_err else None,
        "terminal_info": terminal_info,
        "account_info": account_info,
    }


@router.post("/mt5/armed")
async def set_armed_status(request: ArmedStatusRequest):
    """Set armed status. Expects JSON body: {"armed": true/false}"""
    execution_guard.toggle(request.armed)
    return {"armed": request.armed}


@router.post("/mt5/order", response_model=OrderResponse)
async def place_order(request: OrderRequest):
    """
    Place a market or limit order.

    Requires execution authorization (UI armed + backend enabled).
    """
    # Check execution authorization
    allowed, reason = execution_guard.is_execution_allowed(request.ui_armed)
    if not allowed:
        return OrderResponse(success=False, error=f"Execution not authorized: {reason}")

    return mt5_service.place_order(request)


@router.post("/mt5/partial-close", response_model=PartialCloseResponse)
async def partial_close(request: PartialCloseRequest):
    """
    Partially close an open position.

    Requires execution authorization (UI armed + backend enabled).
    """
    # Check execution authorization
    allowed, reason = execution_guard.is_execution_allowed(request.ui_armed)
    if not allowed:
        return PartialCloseResponse(success=False, error=f"Execution not authorized: {reason}")

    return mt5_service.partial_close(request)


@router.post("/mt5/modify-sl", response_model=OrderResponse)
async def modify_sl(request: ModifySLRequest):
    """
    Modify stop loss of an open position.

    Requires execution authorization (UI armed + backend enabled).
    """
    # Check execution authorization
    allowed, reason = execution_guard.is_execution_allowed(request.ui_armed)
    if not allowed:
        return OrderResponse(success=False, error=f"Execution not authorized: {reason}")

    return mt5_service.modify_sl(request)


@router.get("/mt5/position/{ticket}", response_model=PositionResponse)
async def get_position(ticket: int):
    """Resolve and return an open position snapshot from a position or order ticket."""
    return mt5_service.get_position(ticket)


@router.get("/mt5/positions", response_model=list[OpenPositionInfo])
async def list_positions():
    """List open positions for this app (magic-filtered)."""
    return mt5_service.list_positions()


@router.post("/mt5/move-sl-to-be", response_model=OrderResponse)
async def move_sl_to_be(request: MoveSLToBERequest):
    """Move SL to true break-even (position.price_open) with optional pip buffer."""
    allowed, reason = execution_guard.is_execution_allowed(request.ui_armed)
    if not allowed:
        return OrderResponse(success=False, error=f"Execution not authorized: {reason}")
    return mt5_service.move_sl_to_be(request)


@router.post("/mt5/move-to-be", response_model=OrderResponse)
async def move_to_be(request: MoveToBERequest):
    """Move SL to break-even derived from MT5 position.price_open (position ticket required)."""
    allowed, reason = execution_guard.is_execution_allowed(request.ui_armed)
    if not allowed:
        return OrderResponse(success=False, error=f"Execution not authorized: {reason}")
    return mt5_service.move_to_be(request)


@router.post("/mt5/tp1", response_model=TP1ManageResponse)
async def manage_tp1(request: TP1ManageRequest):
    """Execute TP1 management: partial close + optional move SL to BE."""
    allowed, reason = execution_guard.is_execution_allowed(request.ui_armed)
    if not allowed:
        return TP1ManageResponse(success=False, error=f"Execution not authorized: {reason}")
    return mt5_service.manage_tp1(request)


@router.post("/mt5/tp1/watcher", response_model=TP1WatcherResponse)
async def control_tp1_watcher(request: TP1WatcherRequest):
    """Start or stop the backend TP1 watcher thread."""
    if request.enabled:
        allowed, reason = execution_guard.is_execution_allowed(request.ui_armed)
        if not allowed:
            return TP1WatcherResponse(running=False, locked=False, reason=f"Not authorized: {reason}")
        result = tp1_watcher.start(ui_armed=request.ui_armed)
    else:
        result = tp1_watcher.stop()

    return TP1WatcherResponse(
        running=result.get("running", False),
        locked=result.get("locked", False),
        pid=result.get("pid"),
        reason=result.get("reason"),
        message=result.get("message"),
    )


@router.get("/mt5/tp1/watcher/status")
async def tp1_watcher_status():
    """Get TP1 watcher status and diagnostics."""
    return tp1_watcher.status()