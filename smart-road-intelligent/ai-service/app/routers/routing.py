"""Route planning endpoints."""
from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException

from app.schemas import RouteRequest, SnapRequest
from app.services import weather_service
from app.services.explanation import build_explanation
from app.services.routing_service import RouteNotFound
from app.services.traffic_service import context_document
from app.state import get_state

router = APIRouter(prefix="/routes", tags=["routing"])


def resolve_timestamp(hour: int | None, day_of_week: int | None) -> datetime:
    """Turn an optional hour/weekday into a concrete local timestamp.

    Omitting both means 'now in Mogadishu'. Supplying them shifts to the next
    matching slot so the profile is evaluated against a real calendar instant
    rather than a floating abstraction.
    """
    now = weather_service.now_local()
    if hour is None and day_of_week is None:
        return now
    target = now.replace(
        hour=hour if hour is not None else now.hour, minute=0, second=0, microsecond=0
    )
    if day_of_week is not None:
        shift = (day_of_week - target.weekday()) % 7
        target = target + timedelta(days=shift)
    return target


@router.post("/plan")
async def plan_route(payload: RouteRequest) -> dict[str, Any]:
    state = get_state()
    started = time.perf_counter()

    when = resolve_timestamp(payload.hour, payload.day_of_week)
    context = await state.weather.resolve(
        when,
        overrides=payload.weather.as_dict() if payload.weather else None,
        allow_live=payload.use_live_weather,
    )

    try:
        result = state.routing.find_routes(
            (payload.origin.lon, payload.origin.lat),
            (payload.destination.lon, payload.destination.lat),
            context,
            alternatives=payload.alternatives,
        )
    except RouteNotFound as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    routes = result["routes"]
    explanation = build_explanation(
        routes,
        context,
        model_is_time_aware=state.network.requires_per_request_scoring,
        dispersion_degenerate=state.network.dispersion_is_degenerate,
        score_terms=list(result["scoring"]["weights"]),
    )

    return {
        "routes": routes,
        "recommended_route_id": routes[0]["id"],
        "explanation": explanation,
        "context": context_document(context),
        "planned_for": when.isoformat(),
        "snapping": result["snapping"],
        "scoring": result["scoring"],
        "origin_place": state.places.nearest_place(
            result["snapping"]["origin"]["snapped"]["lon"],
            result["snapping"]["origin"]["snapped"]["lat"],
        ),
        "destination_place": state.places.nearest_place(
            result["snapping"]["destination"]["snapped"]["lon"],
            result["snapping"]["destination"]["snapped"]["lat"],
        ),
        "data_notice": {
            "traffic_data_type": "prototype",
            "message": (
                "Speeds are model predictions over a prepared road network combined with a "
                "rule-based time-of-day profile. They are not live traffic observations."
            ),
        },
        "compute_ms": round((time.perf_counter() - started) * 1000, 1),
    }


@router.post("/snap")
async def snap(payload: SnapRequest) -> dict[str, Any]:
    """Snap an arbitrary coordinate onto the routable network."""
    state = get_state()
    return state.places.snap_coordinate(payload.lon, payload.lat)
