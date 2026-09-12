"""Traffic intelligence endpoints."""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter

from app.routers.routing import resolve_timestamp
from app.schemas import SegmentsRequest, TrafficRequest
from app.state import get_state

router = APIRouter(prefix="/traffic", tags=["traffic"])


async def _context(payload: TrafficRequest):
    state = get_state()
    when = resolve_timestamp(payload.hour, payload.day_of_week)
    return await state.weather.resolve(
        when,
        overrides=payload.weather.as_dict() if payload.weather else None,
        allow_live=payload.use_live_weather,
    )


@router.post("/snapshot")
async def snapshot(payload: TrafficRequest) -> dict[str, Any]:
    """City-wide predicted congestion for the requested time and weather."""
    state = get_state()
    started = time.perf_counter()
    context = await _context(payload)
    result = state.traffic.snapshot(context)
    result["data_notice"] = {
        "traffic_data_type": "prototype",
        "message": (
            "Predicted congestion from the trained model plus the published rule-based "
            "profile. Not derived from live traffic sensors or floating-car data."
        ),
    }
    result["compute_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return result


@router.post("/segments")
async def segments(payload: SegmentsRequest) -> dict[str, Any]:
    """Congestion-coloured road segments inside a map viewport.

    Bounded by design: the browser is never sent the full network.
    """
    state = get_state()
    started = time.perf_counter()
    context = await _context(payload)
    result = state.traffic.segments_in_view(
        context,
        (payload.min_lon, payload.min_lat, payload.max_lon, payload.max_lat),
        limit=payload.limit,
        min_class=payload.min_road_class,
    )
    result["compute_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return result
