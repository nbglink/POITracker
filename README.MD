# MT5 Risk-Based POI Trade Planner & Executor

A local Windows application for **POI-based trading** — traders identify Points of Interest (Fair Value Gaps, Order Blocks, supply/demand zones) on their MT5 charts, then use this tool to place orders at those levels with automatically calculated, risk-managed lot sizes.

## Architecture

```
React/Vite Frontend (localhost:5173) → FastAPI Backend (localhost:8000) → MT5 Terminal (Windows)
```

Primary instruments: XAUUSD, BTCUSD, Forex pairs.

## Features

- **POI workflow:** Identify a level on the chart → enter entry price & stop distance → get the correct lot size instantly
- **Risk-based lot sizing:** Uses `Decimal` arithmetic to respect broker min_lot and volume_step constraints
- **Dual-authorization safety:** UI armed toggle + backend `MT5_EXECUTION_ENABLED` flag — both must be active for any order to execute
- **Real-time data:** WebSocket streaming of live prices and account balance from MT5
- **TP1 management:** Partial close at TP1, automatic SL move to break-even, background watcher thread
- **Auto pip-value derivation:** Computes `pip_value_per_1_lot` from MT5 tick data; falls back to client-provided value
- **Symbol presets:** Save per-symbol defaults (SL, TP, pip value) for quick switching

## Repo Layout

```
frontend/          React + Vite + TypeScript + Tailwind CSS
backend/           FastAPI + Pydantic + MT5 Python API
  app/
    api/           Endpoints: calc, mt5, websocket
    services/      Risk engine, MT5 service, pip specs, execution guard
    models.py      Pydantic request/response schemas
    config.py      Settings from .env (prefix MT5_)
SPEC.MD            Detailed specification
```

## Quickstart

### Prerequisites

- Windows (required for the MT5 Python API)
- Python 3.11+
- Node.js 18+
- MetaTrader 5 terminal installed and running

### Backend

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

# optional: configure environment
copy .env.example .env
# edit .env → set MT5_LOGIN, MT5_PASSWORD, MT5_SERVER, MT5_EXECUTION_ENABLED

python run.py
```

Backend runs at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

## Safety: Dual Authorization

All order execution requires **BOTH** checks to pass:

1. **Frontend:** UI armed toggle must be switched ON (`ArmedToggle.tsx`)
2. **Backend:** Environment variable `MT5_EXECUTION_ENABLED=true` must be set

If either check fails, execution endpoints return 403 / denied. This prevents accidental order placement during development or testing.

## Notes

- MT5 terminal must be running for `/mt5/symbols`, live price streaming, and any order execution.
- Risk calculation (`risk_engine.py`) is pure math with zero MT5 imports — fully unit-testable in isolation.
- The tool does **not** detect POIs — the trader performs the chart analysis; this tool handles the execution and risk management.
