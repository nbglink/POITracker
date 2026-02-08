"""
Risk calculation API endpoint.

POST /calc - Calculate trade volume and risk based on input parameters.
"""
from fastapi import APIRouter, HTTPException
from app.models import RiskCalcInput
from app.services.risk_engine import risk_engine
from app.services.pip_specs import pip_spec_from_mt5

router = APIRouter()


@router.post("/calc")
async def calculate_risk(input_data: RiskCalcInput):
    """
    Calculate trade volume and risk based on input parameters.

    Returns trade plan with volume, risk amounts, warnings, and trade management details.
    """
    try:
        # Derive pip_value_per_1_lot from MT5 tick specs (if available)
        pip_spec = pip_spec_from_mt5(input_data.symbol)

        pip_in_price = None
        tick_size = None
        tick_value = None
        pip_value_per_1_lot_computed = None
        debug: dict = {}

        effective_input = input_data
        if pip_spec and pip_spec.pip_value_per_1_lot > 0:
            pip_in_price = pip_spec.pip_in_price
            tick_size = pip_spec.tick_size
            tick_value = pip_spec.tick_value
            pip_value_per_1_lot_computed = pip_spec.pip_value_per_1_lot
            debug = {
                **pip_spec.debug,
                "pip_in_price": pip_spec.pip_in_price,
                "tick_size_used": pip_spec.tick_size,
                "tick_value_used": pip_spec.tick_value,
                "pip_value_per_1_lot_computed": pip_spec.pip_value_per_1_lot,
                "pip_value_per_1_lot_input": input_data.pip_value_per_1_lot,
            }
            effective_input = input_data.model_copy(update={"pip_value_per_1_lot": pip_spec.pip_value_per_1_lot})
        else:
            debug = {
                "pip_value_per_1_lot_input": input_data.pip_value_per_1_lot,
                "pip_value_per_1_lot_computed": None,
                "note": "MT5 tick specs unavailable; used client-provided pip_value_per_1_lot",
            }

        result = risk_engine.calculate(effective_input)
        payload = result.model_dump()
        payload.update({
            "pip_in_price": pip_in_price,
            "tick_size": tick_size,
            "tick_value": tick_value,
            "pip_value_per_1_lot": pip_value_per_1_lot_computed,
            "debug": debug,
        })
        return payload
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calculation error: {str(e)}")