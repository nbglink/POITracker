"""Unit tests for the risk engine. Pure-math, no MT5."""
from app.models import RiskCalcInput, TradeDirection
from app.services.risk_engine import RiskEngine

XAU_PIP_VALUE = 10.0
FOREX_PIP_VALUE = 10.0


def _xauusd(**overrides) -> RiskCalcInput:
    base = dict(
        account_balance=10_000.0,
        risk_percent=1.0,
        symbol="XAUUSD",
        direction=TradeDirection.BUY,
        entry_price=2000.0,
        stop_pips=50.0,
        max_stop_pips=50.0,
        tp1_pips=30.0,
        partial_percent=50.0,
        move_to_be_enabled=True,
        be_buffer_pips=0.0,
        pip_value_per_1_lot=XAU_PIP_VALUE,
        min_volume=0.01,
        volume_step=0.01,
    )
    base.update(overrides)
    return RiskCalcInput(**base)


def test_baseline_xauusd_50pip_1pct() -> None:
    out = RiskEngine().calculate(_xauusd())
    # target_risk = 100, raw = 100 / (50 * 10) = 0.20 — already a step multiple
    assert out.allowed is True
    assert out.volume == 0.20
    assert out.target_risk_amount == 100.0
    assert abs(out.actual_risk_amount - 100.0) < 1e-6
    assert out.warnings == []


def test_volume_floored_to_step_never_up() -> None:
    # Raw volume = 0.149... should floor to 0.14, not 0.15.
    out = RiskEngine().calculate(_xauusd(risk_percent=0.749))
    assert out.volume == 0.14
    # Actual risk strictly <= target.
    assert out.actual_risk_amount <= out.target_risk_amount + 1e-9


def test_min_volume_enforced_when_calc_too_small() -> None:
    # 0.01% risk on $10k = $1; raw = 1/(50*10) = 0.002 → below min 0.01.
    out = RiskEngine().calculate(_xauusd(risk_percent=0.01))
    assert out.volume == 0.01
    # Warning fires because volume forced above raw.
    assert any("minimum" in w.lower() for w in out.warnings)
    # Actual risk now exceeds target.
    assert out.actual_risk_amount > out.target_risk_amount


def test_min_volume_respects_step_alignment() -> None:
    # Broker has a weird min that isn't step-aligned (min=0.015, step=0.01).
    # Engine should ceil min up to 0.02, not floor down to 0.01.
    out = RiskEngine().calculate(_xauusd(risk_percent=0.001, min_volume=0.015))
    assert out.volume >= 0.02


def test_stop_exceeds_max_blocks_trade() -> None:
    out = RiskEngine().calculate(_xauusd(stop_pips=51.0, max_stop_pips=50.0))
    assert out.allowed is False
    assert any("exceeds maximum" in w for w in out.warnings)


def test_actual_risk_percent_matches_formula() -> None:
    out = RiskEngine().calculate(_xauusd())
    expected = (out.actual_risk_amount / 10_000.0) * 100.0
    assert abs(out.actual_risk_percent - expected) < 1e-9


def test_btcusd_high_pip_count() -> None:
    out = RiskEngine().calculate(_xauusd(
        symbol="BTCUSD",
        stop_pips=500.0,
        max_stop_pips=1000.0,
        pip_value_per_1_lot=1.0,
    ))
    # raw = 100 / (500 * 1) = 0.20
    assert out.volume == 0.20


def test_remaining_volume_reflects_partial_close() -> None:
    out = RiskEngine().calculate(_xauusd(partial_percent=50.0))
    assert out.remaining_volume == round(out.volume * 0.5, 2)


def test_be_sl_price_buy_direction_with_buffer() -> None:
    out = RiskEngine().calculate(_xauusd(be_buffer_pips=2.0, entry_price=2000.0))
    assert out.be_sl_price == 2002.0


def test_be_sl_price_sell_direction_with_buffer() -> None:
    out = RiskEngine().calculate(_xauusd(direction=TradeDirection.SELL, be_buffer_pips=2.0))
    assert out.be_sl_price == 1998.0


def test_volume_step_larger_than_raw_floors_to_zero_then_min() -> None:
    # step=0.1, raw=0.02 → floored to 0.0; min=0.01 ceil-aligned to 0.1.
    out = RiskEngine().calculate(_xauusd(risk_percent=0.1, volume_step=0.1, min_volume=0.01))
    assert out.volume == 0.1


def test_warning_when_actual_risk_exceeds_110pct_of_target() -> None:
    # Pick a config where min_volume forces volume above 110% of target.
    out = RiskEngine().calculate(_xauusd(risk_percent=0.001))
    assert any("significantly exceeds target" in w for w in out.warnings)
