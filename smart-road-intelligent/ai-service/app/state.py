"""Shared service singletons, built once during application startup."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from app.services.graph_service import RoadNetwork
from app.services.model_service import ModelService
from app.services.places_service import PlacesService
from app.services.routing_service import RoutingService
from app.services.traffic_service import TrafficService
from app.services.weather_service import WeatherService

log = logging.getLogger(__name__)


@dataclass
class AppState:
    model: ModelService
    network: RoadNetwork
    routing: RoutingService
    traffic: TrafficService
    weather: WeatherService
    places: PlacesService
    startup_seconds: float


_state: AppState | None = None


def build_state() -> AppState:
    global _state
    started = time.perf_counter()

    model = ModelService()
    network = RoadNetwork(model)
    state = AppState(
        model=model,
        network=network,
        routing=RoutingService(network),
        traffic=TrafficService(network),
        weather=WeatherService(),
        places=PlacesService(network),
        startup_seconds=0.0,
    )
    state.startup_seconds = round(time.perf_counter() - started, 2)
    log.info("Smart Road AI service ready in %.2fs", state.startup_seconds)
    _state = state
    return state


def get_state() -> AppState:
    if _state is None:
        raise RuntimeError("Application state has not been initialised")
    return _state
