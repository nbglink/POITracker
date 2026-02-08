MT5 Risk-Based Trade Planner & Executor — SPECIFICATION
1. Purpose
Design and implement a local Windows application that:


Calculates trade volume (lot size) based on a defined risk percentage.


Applies configurable rules for stop distance, partial close, and break-even management.


Respects broker constraints (minimum lot 0.01).


Allows real BUY/SELL order execution in MetaTrader 5 (MT5) directly from the application.


Displays the difference between target risk and actual risk when minimum lot constraints increase exposure.


Primary instruments:


XAUUSD


BTCUSD


Secondary:
MT5 Risk-Based Trade Planner & Executor — SPECIFICATION

Last updated: 2026-02-08

## 1) Purpose

Build a local Windows application that:

- Calculates risk-based volume (lot size) from account balance, risk %, and stop distance.
- Shows target risk vs actual risk (actual can exceed target when min lot is enforced).
- Optionally executes and manages real trades in MetaTrader 5 via the MT5 Python API.
- Provides TP1 management (partial close + optional move to break-even) and a background TP1 watcher.
- Streams live ticks/account data to the UI via WebSocket.

Primary instruments: XAUUSD, BTCUSD, common Forex pairs.

## 2) Architecture

Frontend (React/Vite) → Backend (FastAPI) → MT5 terminal (Windows)

Typical flow:

1) User enters trade parameters.
2) UI calls `POST /calc` to compute volume + risk and show warnings.
3) User optionally arms execution and confirms.
4) UI calls MT5 endpoints to place/manage orders.
5) UI can subscribe to live tick/account updates via WebSocket.

## 3) Technology stack

- Frontend: React (Vite), TypeScript, Tailwind, settings stored in localStorage.
- Backend: Python 3.11+, FastAPI, Pydantic, MetaTrader5, python-dotenv/pydantic-settings.
- OS constraint: Windows-only for live trading (MT5 Python API requirement).

## 4) Core calculation inputs

Current `RiskCalcInput` fields (backend model):

- `account_balance`
- `risk_percent`
- `symbol`
- `direction`: `buy` | `sell`
- `entry_price`
- `stop_pips`
- `max_stop_pips`
- `tp1_pips` (optional)
- `partial_percent`
- `move_to_be_enabled`
- `be_buffer_pips`
- `pip_value_per_1_lot` (client-provided fallback)
- `min_volume`
- `volume_step`

Note: the backend will try to auto-derive pip value from MT5 tick specs when possible.

## 5) Risk & volume calculation (implementation)

### 5.1 Target risk

`target_risk_amount = account_balance × risk_percent / 100`

### 5.2 Raw volume

`volume_raw = target_risk_amount / (stop_pips × pip_value_per_1_lot)`

### 5.3 Broker constraints

- Volume is floored to `volume_step` (never rounded up).
- Minimum volume is enforced and aligned to the step (ceil-to-step for `min_volume`, then floor-to-step for final).
- Implementation uses Decimal arithmetic to avoid floating point step bugs.

### 5.4 Actual risk

`actual_risk_amount = volume × stop_pips × pip_value_per_1_lot`

`actual_risk_percent = (actual_risk_amount / account_balance) × 100`

### 5.5 Allowed rule

Trade is marked `allowed` only when:

`stop_pips ≤ max_stop_pips`

### 5.6 Warnings

The engine emits warnings for:

- Stop exceeding max stop
- Volume being forced up to minimum (actual risk can exceed target)
- Actual risk significantly exceeding target

## 6) Pip value derivation (current behavior)

The backend attempts to compute `pip_value_per_1_lot` from MT5:

Preferred method:

- Use `mt5.order_calc_profit()` for a 1-lot buy move of +1 pip (conversion-aware to account currency).

Fallback method:

- Use tick specs: `pip_value_per_1_lot = (pip_in_price / tick_size) × tick_value`.

Pip definition in price (`pip_in_price`) is derived by symbol heuristics:

- XAU: 0.10
- BTC: 1.00
- Forex: digits-based defaults (5 digits → 0.0001, 3 digits → 0.01)

If MT5 tick data is unavailable, the backend uses the client-provided `pip_value_per_1_lot`.

## 7) Execution safety model (dual authorization)

All execution endpoints are protected by two independent checks:

1) Backend global flag: `MT5_EXECUTION_ENABLED=true`
2) UI armed state:
	 - stored in backend memory via `POST /mt5/armed`, and/or
	 - passed per-request via `ui_armed` fields on execution payloads

If either check fails, the backend denies execution (either via HTTP 403 for some routes or `success=false` responses for others).

Important: keep this pattern intact; do not bypass it.

## 8) Backend API (implementation-aligned)

Base URL: `http://localhost:8000`

### 8.1 Health

- `GET /health` → `{ "status": "ok" }`
- `GET /test` → `{ "message": "Hello World" }`

### 8.2 Calculation

- `POST /calc` → returns the `RiskCalcOutput` payload plus pip/tick debug fields:
	- `pip_in_price`, `tick_size`, `tick_value`
	- `pip_value_per_1_lot` (computed value when available)
	- `debug` (derivation details)

### 8.3 MT5 status & discovery

- `GET /mt5/status` → MT5 terminal/account connectivity snapshot
- `GET /mt5/diagnostics` → extra environment + MT5 init/last_error info
- `GET /mt5/symbols` → list of symbols with digits/point + derived pip/tick/pip-value fields

### 8.4 Arming & backend execution flag

- `GET /mt5/armed` → `{ armed: boolean }`
- `POST /mt5/armed` body `{ armed: boolean }` → sets stored UI armed state
- `POST /mt5/execution-enable` body `{ armed: boolean }` → sets backend execution flag

### 8.5 Order & position operations (execution-guarded)

- `POST /mt5/order` → place market/limit order
- `POST /mt5/partial-close`
	- Preferred payload: `{ position_ticket, percent, ui_armed }`
	- Legacy supported: `{ ticket, volume, ui_armed }`
	- Backend normalizes close volume to broker step and can block unsafe partial closes
- `POST /mt5/modify-sl` → modify stop-loss for a position
- `GET /mt5/position/{ticket}` → resolves a position snapshot (position ticket or order ticket)
- `GET /mt5/positions` → lists open positions owned by this app (magic/comment filtered)
- `POST /mt5/move-to-be` → move SL to true break-even derived from MT5 position.price_open
- `POST /mt5/move-sl-to-be` → legacy BE endpoint

### 8.6 TP1 management

- `POST /mt5/tp1` → partial close + optional BE move in one call

### 8.7 TP1 watcher (background)

- `POST /mt5/tp1/watcher` body `{ enabled: boolean, ui_armed: boolean }`
	- When starting: requires execution authorization
	- Uses a cross-process file lock (`.tp1_watcher.lock`) to prevent multiple watchers
- `GET /mt5/tp1/watcher/status` → watcher diagnostics (running, lock owner pid, last events, etc.)

## 9) WebSocket live data

- `WS /ws/live`
	- Client messages:
		- `{ type: "subscribe", symbol }`
		- `{ type: "unsubscribe" }`
		- `{ type: "toggle_account", enabled }`
	- Server messages:
		- `{ type: "tick", symbol, bid, ask, spread, time }`
		- `{ type: "account", balance, equity, margin, free_margin, currency }`

REST fallbacks:

- `GET /live/price/{symbol}`
- `GET /live/account`

## 10) TP1 watcher behavior (current)

- Runs as a background thread with a cross-process lock.
- Poll interval and defaults are configured in backend settings:
	- `tp1_pips_default`, `tp1_percent_default`, `tp1_be_buffer_pips`, `tp1_poll_interval_s`
- Filters to “app-owned” positions using:
	- `MAGIC = 123456`
	- order comment prefix `POI-Tracker`

## 11) Configuration

Backend uses `.env` with prefix `MT5_` (via pydantic-settings). Key values:

- `MT5_EXECUTION_ENABLED` (default false)
- `MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER` (optional auto-login)
- `MT5_PATH` (optional MT5 terminal path)
- `MT5_HOST`, `MT5_PORT`, `MT5_DEBUG`

## 12) Acceptance criteria (current level)

- Risk calculation is deterministic/testable and MT5-free.
- Auto pip derivation is attempted when MT5 is available; falls back to client pip value.
- Execution is protected by dual authorization (UI armed + backend env flag).
- MT5 endpoints exist for: status, symbols, orders, partial close, modify SL, BE move, TP1 manage, TP1 watcher.
- Live data streaming is available via WebSocket and REST fallbacks.