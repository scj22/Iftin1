"""Model transparency, network statistics and place search."""
from __future__ import annotations

from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Query

from app.services import congestion
from app.state import get_state

router = APIRouter(tags=["insights"])


@router.get("/model/card")
async def model_card() -> dict[str, Any]:
    """What the model is, what it was trained on, and what it cannot do."""
    state = get_state()
    card = asdict(state.network.card)
    card["weather_sources"] = state.weather.source_document()
    card["startup_seconds"] = state.startup_seconds
    return card


@router.get("/model/congestion-profile")
async def congestion_profile() -> dict[str, Any]:
    """The full rule-based profile, published for review."""
    return congestion.profile_document()


@router.get("/network/stats")
async def network_stats() -> dict[str, Any]:
    state = get_state()
    return {
        "city": "Mogadishu",
        "region": "Banaadir",
        "country": "Somalia",
        **state.network.stats,
        "warnings": state.network.build_warnings,
        "source": (
            "OpenStreetMap road extract prepared during the Smart Road data phase. "
            "Geometry, class, surface and lane attributes come from that extract."
        ),
    }


@router.get("/places/search")
async def search_places(
    q: str = Query(..., min_length=1, max_length=120),
    limit: int = Query(8, ge=1, le=20),
    remote: bool = Query(True),
) -> dict[str, Any]:
    state = get_state()
    return await state.places.search(q, limit=limit, allow_remote=remote)


@router.get("/places")
async def list_places() -> dict[str, Any]:
    state = get_state()
    entries = state.places.all_places()
    return {
        "places": entries,
        "count": len(entries),
        "notice": (
            "Built-in landmark anchors with approximate centroids, each snapped to the "
            "nearest routable node. Use place search for OpenStreetMap results."
        ),
    }
