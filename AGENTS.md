# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this app is

Local Windows tool for **POI-based trading** on MT5. Trader identifies a Point of Interest on the chart (FVG / order block / supply-demand), enters entry + stop distance + risk %, and the tool calculates the lot size and places the order. The tool does not detect POIs — it handles execution and risk management.

Stack: React/Vite/TypeScript (port 5173) → FastAPI/Pydantic (port 8000) → MetaTrader5 Python API. **Windows-only** (the MT5 Python package only runs on Windows). `SPEC.MD` is the source of truth for behavior.

## Common commands

Backend (requires MT5 terminal running for any `/mt5/*` work):

```powershell
cd backend
python -m venv .venv; .\.venv\Scripts\activate
pip install -r requirements.txt
python run.py                    # uvicorn on 127.0.0.1:8000, no --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev                      # Vite on 5173
npm run build                    # tsc + vite build (typecheck is part of build)
npm run lint                     # eslint, --max-warnings 0
```

Backend test scripts are **plain scripts, not pytest** — run with `python backend/test_endpoints.py` etc. They hit a live `TestClient(app)` (or a running server for `test_with_server.py`). There is no configured test runner. The risk engine is pure math and can be unit-tested in isolation if you add a runner.

Single endpoint smoke check: `python backend/verify_endpoints.py` (or `verify_endpoints_urllib.py`).

## Architecture — what requires reading multiple files to grasp

### Dual-authorization execution guard (DO NOT BYPASS)

Every order-mutating endpoint must pass **both** checks or return 403:

1. Backend: `MT5_EXECUTION_ENABLED=true` env var (loaded by `app/config.py`, prefix `MT5_`)
2. UI: `ui_armed=true` on the request payload, set by the `ArmedToggle` component

Enforced by `execution_guard.is_execution_allowed()` called from `check_execution_auth()` in `app/api/mt5.py`. The TP1 watcher re-checks this **per tick** so disarming the UI mid-run halts execution without stopping the watcher itself. Add the same guard to any new mutation endpoint.

### Three-layer separation in `backend/app/`

- `api/` — FastAPI routers (`calc.py`, `mt5.py`, `websocket.py`). Thin: validate, auth-check, delegate.
- `services/risk_engine.py` — **pure math, zero MT5 imports.** Uses `Decimal` to floor to `volume_step` and ceil-align `min_volume`. Keep it import-free so it stays unit-testable without a terminal.
- `services/mt5_service.py` — all `MetaTrader5` calls live here, plus the TP1 watcher thread. Tags app-owned positions with `MAGIC = 123456` and comment prefix `POI-Tracker` — the watcher filters on these so it ignores positions opened from outside the app.
- `services/pip_specs.py` — derives `pip_value_per_1_lot`. Fallback chain: `mt5.order_calc_profit()` → `(pip_in_price / tick_size) × tick_value` → client-provided value from the symbol preset.

`api/calc.py` is where pip auto-derivation is wired in: it asks `pip_specs` for an MT5-derived value, falls back to the client value, then hands everything to `risk_engine.calculate()`. Don't push MT5 lookups into `risk_engine`.

### TP1 watcher (background thread)

Lives in `mt5_service.py`. Polls every `tp1_poll_interval_s` (default 0.5s). On TP1 hit: closes 50% (volume normalized to `volume_step`) and moves SL to break-even. On position disappearance: looks up deal history and emits a toast event with realized P&L.

Single-instance enforced by a **cross-process file lock at `backend/.tp1_watcher.lock`** with PID-based stale detection. If you see leftover lock files in git status, that's expected — they're gitignored runtime state. Watcher stops on FastAPI shutdown via the `shutdown_event` hook in `main.py`.

### Frontend ↔ backend contract

- `frontend/src/api/client.ts` hardcodes baseURL `http://localhost:8000` (10s timeout).
- `frontend/src/types/` interfaces **must mirror** Pydantic models in `backend/app/models.py`. When changing a model, update the matching TS interface or calculation responses will silently lose fields.
- CORS in `main.py` only allows `localhost:5173` and `5174` — add new origins there.
- Live data: `useLiveData` hook talks to `WS /ws/live` with auto-reconnect (`subscribe`, `unsubscribe`, `toggle_account`, `ping`). REST fallbacks are `GET /live/price/{symbol}` and `GET /live/account`.
- State: `SettingsContext` persists user settings (risk %, symbol presets) to localStorage and auto-fetches `/mt5/symbols` on startup.

### Strategy rules baked into the system

Per-instrument max stop pips (XAUUSD 50, BTCUSD 1000, Forex 50). When `stop_pips > max_stop_pips`, `risk_engine` returns `allowed=false` and the UI **blocks** the execute button — this is intentional discipline, not a soft warning. Defaults live in `services/symbol_defaults.py`.

Partial close percentages are 25/50/75/100. The backend rejects a close if the **remaining** volume would fall below `min_lot` (would create an un-closeable micro-position). Preferred payload is `{ position_ticket, percent, ui_armed }`; legacy `{ ticket, volume, ui_armed }` is still accepted.

## Adding a new trade parameter (touches all layers)

1. `backend/app/models.py` — add field to `RiskCalcInput` / output as needed.
2. `backend/app/services/risk_engine.py` — use it in `calculate()`.
3. `backend/app/api/calc.py` — include in the response payload.
4. `frontend/src/types/` — mirror the Pydantic change.
5. UI: wire into `InputForm` and whichever display component (`VolumeHero` / `RiskVisualizer` / `TradePreview`) needs it.

## Gotchas

- **No `--reload` in `run.py`.** The TP1 watcher's file lock plus uvicorn's reloader spawning a child process is a footgun — the production run script intentionally disables reload. If you want auto-reload during dev, run `uvicorn app.main:app --reload` directly and accept that the watcher will fight the lock.
- `mt5.initialize()` is called lazily inside endpoints (see `/mt5/symbols`) and decoded for specific error codes (10017 = terminal not running, 10004 = privilege mismatch). Preserve those messages — users rely on them.
- All risk math uses `Decimal`. Don't reintroduce floats into `risk_engine.py` — the floor-to-step logic breaks under float drift.
- `MAGIC = 123456` and `ORDER_COMMENT = "POI-Tracker"` are how the watcher identifies app-owned positions. Don't change these without coordinating the watcher filter.
