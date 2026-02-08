# Copilot Instructions — MT5 Risk-Based Trade Planner

## Architecture Overview
```
React/Vite Frontend (localhost:5173) → FastAPI Backend (localhost:8000) → MT5 Terminal (Windows)
```
Primary instruments: XAUUSD, BTCUSD, Forex pairs. Windows-only (MT5 Python API).

## Critical Safety Pattern: Dual Authorization
**ALL order execution requires BOTH checks — never bypass:**
1. Frontend `armed` state (UI toggle in `ArmedToggle.tsx`)
2. Backend `EXECUTION_ENABLED` env flag + `ui_armed` request param

See `execution_guard.py` → `check_execution_auth()` in `api/mt5.py`. Orders return 403 if either guard fails.

## Risk Calculation (Pure Math)
Located in `services/risk_engine.py` — **keep MT5-free for testability**:
```python
target_risk = account_balance × risk_percent / 100
volume_raw = target_risk / (stop_pips × pip_value_per_1_lot)
volume = max(min_volume, floor(volume_raw / volume_step) × volume_step)
```
Display both target and actual risk — actual exceeds target when min_lot enforced.

## Key Architectural Boundaries

| Layer | File | Purpose |
|-------|------|---------|
| API | `api/calc.py` | POST `/calc` — combines pip_specs + risk_engine |
| API | `api/mt5.py` | `/mt5/status`, `/mt5/order`, `/mt5/symbols` — all execution guarded |
| Service | `services/risk_engine.py` | **Pure calc, no imports from MT5** |
| Service | `services/mt5_service.py` | MT5 API wrapper (connect, order, close) |
| Service | `services/pip_specs.py` | Derives `pip_value_per_1_lot` from MT5 tick data |

**Pattern:** `calc.py` calls `pip_spec_from_mt5()` to auto-compute pip values, falls back to client-provided value.

## Frontend Structure
- **State:** `SettingsContext.tsx` loads from localStorage, auto-fetches `/mt5/symbols` on startup
- **API client:** `api/client.ts` — axios instance, base URL hardcoded to `localhost:8000`
- **Types:** `types/trade.ts`, `types/api.ts` — must mirror Pydantic models in `backend/app/models.py`
- **Calculator flow:** `InputForm` → `useCalculation` hook → displays in `VolumeHero`, `RiskVisualizer`, `TradePreview`

## Development Commands
```bash
# Backend (requires MT5 terminal running)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev  # Vite on port 5173
```

## Adding New Trade Parameters
1. `models.py` — add to `RiskCalcInput` Pydantic model
2. `risk_engine.py` — update `calculate()` method
3. `api/calc.py` — include in response payload if needed
4. `frontend/src/types/trade.ts` — add to `RiskCalcInput`/`RiskCalcOutput` interfaces
5. UI component — wire into form and display

## Pip Value Derivation
`pip_specs.py` computes: `pip_value_per_1_lot = (pip_in_price / tick_size) × tick_value`
- XAUUSD: pip = 0.10, BTCUSD: pip = 1.00, Forex 5-digit: pip = 0.0001
- Fetched from MT5 `symbol_info()` with fallbacks for missing tick_value

## Config & Environment
`backend/app/config.py` loads `.env` with prefix `MT5_`:
- `MT5_EXECUTION_ENABLED=false` (default off for safety)
- `MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER` for auto-login

## Testing Approach
- Unit test `risk_engine.py` in isolation (no mocking needed)
- MT5 tests require running terminal — use `test_endpoints.py` scripts
- Edge cases: min_lot enforcement, stop > max_stop, zero pip_value
