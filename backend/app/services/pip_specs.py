"""Pip/tick specification helpers.

Derives pip_value_per_1_lot from MT5 tick specs:
  pip_value_per_1_lot = (pip_in_price / tick_size) * tick_value

This module may import MetaTrader5; keep `risk_engine.py` MT5-free.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import MetaTrader5 as mt5


@dataclass(frozen=True)
class PipSpec:
    symbol: str
    pip_in_price: float
    tick_size: float
    tick_value: float
    pip_value_per_1_lot: float
    debug: dict[str, Any]


def pip_in_price_for_symbol(symbol: str, digits: int) -> float:
    """Per-symbol pip definition in price terms."""
    s = (symbol or "").upper()

    # XAUUSD
    if "XAU" in s or "GOLD" in s:
        return 0.10

    # BTCUSD
    if "BTC" in s or "XBT" in s:
        return 1.00

    # Forex: based on digits
    # - 5-digit pricing: pip is 0.0001
    # - 3-digit pricing: pip is 0.01
    if digits == 3:
        return 0.01
    if digits == 5:
        return 0.0001

    # Sensible fallbacks (still consistent with forex conventions)
    if digits in (2,):
        return 0.01
    return 0.0001


def _pick_tick_value(info: Any) -> tuple[float, str]:
    """Prefer trade_tick_value, otherwise fall back to profit/loss fields."""
    tv = float(getattr(info, "trade_tick_value", 0.0) or 0.0)
    if tv > 0:
        return tv, "trade_tick_value"

    tvp = float(getattr(info, "trade_tick_value_profit", 0.0) or 0.0)
    if tvp > 0:
        return tvp, "trade_tick_value_profit"

    tvl = float(getattr(info, "trade_tick_value_loss", 0.0) or 0.0)
    if tvl < 0:
        return abs(tvl), "abs(trade_tick_value_loss)"
    if tvl > 0:
        return tvl, "trade_tick_value_loss"

    return 0.0, "none"


def pip_spec_from_mt5(symbol: str) -> Optional[PipSpec]:
    """Compute PipSpec from MT5 `symbol_info` tick specs."""
    if not mt5.initialize():
        return None

    info = mt5.symbol_info(symbol)
    if info is None:
        return None

    digits = int(getattr(info, "digits", 0) or 0)
    pip_in_price = pip_in_price_for_symbol(symbol, digits)

    tick_size = float(getattr(info, "trade_tick_size", 0.0) or 0.0)
    if tick_size <= 0:
        # Some brokers leave trade_tick_size empty; point is a decent fallback.
        tick_size = float(getattr(info, "point", 0.0) or 0.0)

    tick_value, tick_value_source = _pick_tick_value(info)

    # Prefer MT5's conversion-aware profit calculator when possible.
    # This tends to be the most reliable way to get pip value in account currency.
    pip_value_per_1_lot = 0.0
    order_calc_profit_used = False

    try:
        tick = mt5.symbol_info_tick(symbol)
        if tick is not None:
            price_open = float(getattr(tick, "ask", 0.0) or 0.0)
            if price_open > 0:
                profit = mt5.order_calc_profit(
                    mt5.ORDER_TYPE_BUY,
                    symbol,
                    1.0,
                    price_open,
                    price_open + float(pip_in_price),
                )
                if profit is not None:
                    pip_value_per_1_lot = abs(float(profit))
                    order_calc_profit_used = pip_value_per_1_lot > 0
    except Exception:
        order_calc_profit_used = False

    # Fallback to tick-size formula.
    if pip_value_per_1_lot <= 0 and tick_size > 0 and tick_value > 0:
        pip_value_per_1_lot = (pip_in_price / tick_size) * tick_value

    debug = {
        "digits": digits,
        "point": float(getattr(info, "point", 0.0) or 0.0),
        "trade_contract_size": float(getattr(info, "trade_contract_size", 0.0) or 0.0),
        "trade_tick_size": float(getattr(info, "trade_tick_size", 0.0) or 0.0),
        "trade_tick_value": float(getattr(info, "trade_tick_value", 0.0) or 0.0),
        "trade_tick_value_profit": float(getattr(info, "trade_tick_value_profit", 0.0) or 0.0),
        "trade_tick_value_loss": float(getattr(info, "trade_tick_value_loss", 0.0) or 0.0),
        "tick_value_source": tick_value_source,
        "order_calc_profit_used": order_calc_profit_used,
        "pip_value_formula": "(pip_in_price / tick_size) * tick_value",
    }

    return PipSpec(
        symbol=symbol,
        pip_in_price=float(pip_in_price),
        tick_size=float(tick_size),
        tick_value=float(tick_value),
        pip_value_per_1_lot=float(pip_value_per_1_lot),
        debug=debug,
    )
