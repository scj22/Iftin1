"""Smart Road AI service.

Serves traffic-speed inference, the routable Mogadishu network, A* route
planning with alternatives, and the transparency endpoints that describe what
the model can and cannot do.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routers import insights, routing, traffic
from app.state import build_state, get_state

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
)
log = logging.getLogger("smartroad")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Building Smart Road AI service state")
    build_state()
    yield
    log.info("Smart Road AI service shutting down")


app = FastAPI(
    title="Smart Road AI Service",
    description=(
        "Traffic prediction and route intelligence for Mogadishu. Combines a trained "
        "RandomForest speed model with a published rule-based congestion profile over a "
        "prepared OpenStreetMap road network."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Only the Express backend and the Vite dev server talk to this service.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4000",
        "http://127.0.0.1:4000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(routing.router, prefix="/api/v1")
app.include_router(traffic.router, prefix="/api/v1")
app.include_router(insights.router, prefix="/api/v1")


@app.get("/health", tags=["system"])
async def health() -> dict[str, Any]:
    settings = get_settings()
    try:
        state = get_state()
    except RuntimeError:
        return {"status": "starting", "city": settings.city}
    return {
        "status": "ok",
        "city": settings.city,
        "region": settings.region,
        "model_loaded": True,
        "network_segments": state.network.stats["segments"],
        "network_nodes": state.network.stats["nodes"],
        "startup_seconds": state.startup_seconds,
    }
