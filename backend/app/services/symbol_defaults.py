"""
Symbol-aware default parameters for SL/TP pips.

Proportional scaling (10x factor):
  XAUUSD: pip=$0.10 → SL=50 ($5),   TP=30 ($3)   → RR ~1:1.67
  BTCUSD: pip=$1.00 → SL=500 ($500), TP=300 ($300) → RR ~1:1.67
  Forex:  pip=$0.0001 → SL=50, TP=30               → RR ~1:1.67
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class SymbolDefaults:
    stop_loss_pips: float
    take_profit_pips: float
    max_stop_pips: float
    pip_value_per_1_lot: float


SYMBOL_DEFAULTS: dict[str, SymbolDefaults] = {
    "XAUUSD": SymbolDefaults(stop_loss_pips=50, take_profit_pips=30, max_stop_pips=50, pip_value_per_1_lot=10),
    "BTCUSD": SymbolDefaults(stop_loss_pips=500, take_profit_pips=300, max_stop_pips=1000, pip_value_per_1_lot=1),
}

FOREX_DEFAULTS = SymbolDefaults(stop_loss_pips=50, take_profit_pips=30, max_stop_pips=50, pip_value_per_1_lot=10)


def get_symbol_defaults(symbol: str) -> SymbolDefaults:
    """Return sensible defaults for a given symbol, falling back to forex."""
    upper = symbol.upper()

    if upper in SYMBOL_DEFAULTS:
        return SYMBOL_DEFAULTS[upper]

    # Partial match for broker suffixes (e.g. "BTCUSD.m", "XAUUSD.i")
    for key, defaults in SYMBOL_DEFAULTS.items():
        if upper.startswith(key):
            return defaults

    return FOREX_DEFAULTS
