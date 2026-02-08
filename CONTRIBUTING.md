# Contributing

Thanks for your interest in contributing.

## Development setup

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

### Frontend (Vite + React)

```bash
cd frontend
npm install
npm run dev
```

## Safety note (MT5 execution)

Order execution is guarded by two independent checks:
1) the UI *armed* toggle, and
2) the backend env flag `MT5_EXECUTION_ENABLED=true`.

Do not bypass these guards.
