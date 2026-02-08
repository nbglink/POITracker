"""
FastAPI application for MT5 Risk-Based Trade Planner.

Provides REST API for risk calculations and MT5 integration.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.api import calc, mt5
from app.api.websocket import router as ws_router
# from app.services.mt5_service import mt5_service

app = FastAPI(
    title="MT5 Risk-Based Trade Planner",
    description="Calculate trade volumes and manage MT5 orders based on risk percentage",
    version="1.0.0"
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],  # Vite dev server ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_event():
    """Stop TP1 watcher and release lock on shutdown."""
    from app.services.mt5_service import tp1_watcher
    tp1_watcher.stop()


@app.get("/test")
async def test_endpoint():
    """Test endpoint."""
    return {"message": "Hello World"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


# Include API routers
app.include_router(calc.router)
app.include_router(mt5.router)
app.include_router(ws_router, tags=["WebSocket"])