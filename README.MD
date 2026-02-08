## MT5 Risk-Based Trade Planner & Executor

Local Windows app to calculate risk-based lot size and (optionally) place/manage trades in MetaTrader 5.

Architecture:

`React/Vite Frontend (localhost:5173)` → `FastAPI Backend (localhost:8000)` → `MT5 Terminal (Windows)`

Primary instruments: XAUUSD, BTCUSD, Forex pairs.

### Key safety: dual authorization

All order execution requires BOTH:

1. Frontend UI armed toggle
2. Backend env flag `MT5_EXECUTION_ENABLED=true`

If either is off, execution endpoints should deny requests.

### Repo layout

- `frontend/` — React + Vite UI
- `backend/` — FastAPI server + MT5 integration
- `SPEC.MD` — detailed specification

## Quickstart

### Backend

Prereqs:

- Windows
- Python 3.11+
- MetaTrader 5 terminal installed and running (required for symbol list + live trading)

Setup:

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

# optional: configure env
copy .env.example .env

python run.py
```

Backend runs at `http://127.0.0.1:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

## Notes

- The backend includes MT5 endpoints (status/symbols/orders). MT5 terminal connectivity is required for `/mt5/symbols` and any live execution.
- Risk calculation logic is designed to be MT5-free (pure math) to keep it testable.

## CI

GitHub Actions workflow is in `.github/workflows/ci.yml`:

- Backend: Windows runner, installs requirements, compiles python modules, import smoke test
- Frontend: Node build 
