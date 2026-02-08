"""
Risk calculation engine.

Pure calculation logic with no MT5 dependencies - fully testable.
"""
from app.models import RiskCalcInput, RiskCalcOutput

from decimal import Decimal, ROUND_DOWN, ROUND_UP


class RiskEngine:
    """Calculate trade volume and risk based on input parameters."""

    def calculate(self, input_data: RiskCalcInput) -> RiskCalcOutput:
        """
        Calculate trade volume and risk metrics.

        Formula: volume = target_risk_amount / (stop_pips * pip_value_per_1_lot)
        """
        # Calculate target risk amount
        target_risk_amount = input_data.account_balance * input_data.risk_percent / 100

        # Calculate raw volume
        pip_value = input_data.pip_value_per_1_lot
        stop_pips = input_data.stop_pips

        if pip_value <= 0 or stop_pips <= 0:
            volume_raw = 0.0
        else:
            volume_raw = target_risk_amount / (stop_pips * pip_value)

        # Apply broker constraints (floor to volume_step, enforce minimum)
        # Use Decimal to avoid float step/rounding bugs.
        volume_step = input_data.volume_step
        min_volume = input_data.min_volume

        if volume_step <= 0:
            step = Decimal("0.01")
            stepped = Decimal("0")
        else:
            step = Decimal(str(volume_step))
            raw = Decimal(str(volume_raw))
            stepped = (raw / step).to_integral_value(rounding=ROUND_DOWN) * step

        # Ensure min volume respects step sizing (ceil min_volume to a valid step)
        min_d = Decimal(str(min_volume))
        min_valid = (min_d / step).to_integral_value(rounding=ROUND_UP) * step

        volume_d = stepped if stepped > min_valid else min_valid
        volume_d = (volume_d / step).to_integral_value(rounding=ROUND_DOWN) * step

        volume = float(volume_d)
        volume_raw = float(Decimal(str(volume_raw)).quantize(Decimal("0.0001"), rounding=ROUND_DOWN))

        # Calculate actual risk with final volume
        actual_risk_amount = volume * stop_pips * pip_value
        actual_risk_percent = (actual_risk_amount / input_data.account_balance) * 100 if input_data.account_balance > 0 else 0

        # Check if trade is allowed (stop within max)
        allowed = stop_pips <= input_data.max_stop_pips

        # Build warnings list
        warnings: list[str] = []
        if not allowed:
            warnings.append(f"Stop loss ({stop_pips} pips) exceeds maximum allowed ({input_data.max_stop_pips} pips)")
        if volume <= float(min_valid) and volume_raw < float(min_valid):
            warnings.append(f"Volume floored to minimum ({float(min_valid)}). Actual risk exceeds target.")
        if actual_risk_percent > input_data.risk_percent * 1.1:
            warnings.append(f"Actual risk ({actual_risk_percent:.2f}%) significantly exceeds target ({input_data.risk_percent}%)")

        # Trade management calculations
        tp1_pips = input_data.tp1_pips
        partial_percent = input_data.partial_percent
        remaining_volume = round(volume * (1 - partial_percent / 100), 2)

        # Break-even SL price calculation
        be_sl_price = None
        if input_data.move_to_be_enabled and input_data.entry_price > 0:
            # Get pip size from symbol (approximate based on entry price magnitude)
            # This is a simplified calculation - real implementation should use symbol info
            if input_data.direction.value == "buy":
                be_sl_price = input_data.entry_price + input_data.be_buffer_pips
            else:
                be_sl_price = input_data.entry_price - input_data.be_buffer_pips

        return RiskCalcOutput(
            allowed=allowed,
            volume_raw=volume_raw,
            volume=volume,
            target_risk_amount=round(target_risk_amount, 2),
            actual_risk_amount=round(actual_risk_amount, 2),
            target_risk_percent=input_data.risk_percent,
            actual_risk_percent=round(actual_risk_percent, 2),
            tp1_pips=tp1_pips,
            partial_percent=partial_percent,
            remaining_volume=remaining_volume,
            be_sl_price=be_sl_price,
            warnings=warnings,
        )


# Singleton instance
risk_engine = RiskEngine()
