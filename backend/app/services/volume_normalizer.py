"""Pure Decimal-based volume normalization helpers.

Intentionally MT5-free so it can be imported from both ``risk_engine`` and
``mt5_service`` without coupling the engine to the broker SDK. Risk math and
order execution agree on the same step-flooring contract; keep that here.
"""
from decimal import Decimal, ROUND_DOWN, ROUND_FLOOR, ROUND_UP


def floor_to_step(value: float, step: float) -> float:
    """Floor ``value`` to the nearest multiple of ``step``. Never rounds up."""
    if step <= 0 or value <= 0:
        return 0.0
    v = Decimal(str(value))
    s = Decimal(str(step))
    steps = (v / s).to_integral_value(rounding=ROUND_FLOOR)
    return float(steps * s)


def ceil_min_to_step(min_volume: float, step: float) -> float:
    """Ceil ``min_volume`` up to the nearest valid step multiple."""
    if step <= 0:
        return 0.0
    m = Decimal(str(min_volume))
    s = Decimal(str(step))
    steps = (m / s).to_integral_value(rounding=ROUND_UP)
    return float(steps * s)


def normalize_volume(
    raw: float,
    step: float,
    min_volume: float,
    max_volume: float | None = None,
) -> float:
    """Floor ``raw`` to ``step``, then enforce ``min_volume`` and optional ``max_volume``.

    Used by the risk engine to convert a target lot size into a broker-valid one.
    Returns a step-aligned float.
    """
    if step <= 0:
        return 0.0
    raw_d = Decimal(str(raw))
    step_d = Decimal(str(step))
    floored = (raw_d / step_d).to_integral_value(rounding=ROUND_DOWN) * step_d
    min_aligned = Decimal(str(ceil_min_to_step(min_volume, step)))
    chosen = floored if floored >= min_aligned else min_aligned
    if max_volume is not None and max_volume > 0:
        max_d = Decimal(str(max_volume))
        if chosen > max_d:
            chosen = (max_d / step_d).to_integral_value(rounding=ROUND_DOWN) * step_d
    return float(chosen)
