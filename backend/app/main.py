"""
FastAPI application for MT5 Risk-Based Trade Planner.

Provides REST API for risk calculations and MT5 integration. When a built
frontend is present (packaged desktop build), it is also served from this app so
the whole thing runs on one origin/port with no separate dev server.
"""
import os
import sys
from typing import Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.api import calc, mt5
from app.api.websocket import router as ws_router


def _frontend_dist() -> Optional[str]:
    """Locate the built frontend (frontend/dist), in dev or when frozen by PyInstaller."""
    candidates = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(os.path.join(meipass, "frontend_dist"))
    here = os.path.dirname(os.path.abspath(__file__))
    candidates.append(os.path.join(here, "..", "..", "frontend", "dist"))
    for c in candidates:
        if os.path.isdir(c) and os.path.isfile(os.path.join(c, "index.html")):
            return c
    return None

app = FastAPI(
    title="MT5 Risk-Based Trade Planner",
    description="Calculate trade volumes and manage MT5 orders based on risk percentage",
    version="1.0.0",
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://localhost:5174",  # Vite dev server ports
        "http://localhost:8000", "http://127.0.0.1:8000",   # packaged desktop (same-origin)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_event():
    """Stop TP1 watcher and release lock on shutdown."""
    from app.services.mt5_service import tp1_watcher
    tp1_watcher.stop()


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


# Include API routers
app.include_router(calc.router)
app.include_router(mt5.router)
app.include_router(ws_router, tags=["WebSocket"])

# Serve the built frontend last, as a catch-all, so API/WS routes above win.
# Only mounted when a build exists (packaged desktop app); in dev the frontend
# is served by Vite instead.
_dist = _frontend_dist()
if _dist:
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")