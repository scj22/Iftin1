"""Request and response models for the AI service."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class Coordinate(BaseModel):
    lon: float = Field(..., ge=-180, le=180)
    lat: float = Field(..., ge=-90, le=90)


class WeatherOverride(BaseModel):
    """Lets the demo and the traffic explorer test 'what if it rains' honestly."""

    precipitation_mm: float | None = Field(default=None, ge=0, le=200)
    temperature_c: float | None = Field(default=None, ge=-20, le=60)
    cloud_cover_pct: float | None = Field(default=None, ge=0, le=100)
    wind_speed_kmh: float | None = Field(default=None, ge=0, le=300)

    def as_dict(self) -> dict[str, float]:
        return {key: value for key, value in self.model_dump().items() if value is not None}


class RouteRequest(BaseModel):
    origin: Coordinate
    destination: Coordinate
    # Local Mogadishu time. Omitted means "now".
    hour: int | None = Field(default=None, ge=0, le=23)
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    alternatives: int = Field(default=2, ge=0, le=3)
    weather: WeatherOverride | None = None
    use_live_weather: bool = True


class TrafficRequest(BaseModel):
    hour: int | None = Field(default=None, ge=0, le=23)
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    weather: WeatherOverride | None = None
    use_live_weather: bool = True


class SegmentsRequest(TrafficRequest):
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float
    limit: int = Field(default=1200, ge=50, le=4000)
    min_road_class: float = Field(default=0.5, ge=0.0, le=1.0)

    @field_validator("max_lon")
    @classmethod
    def _lon_order(cls, value: float, info: Any) -> float:
        minimum = info.data.get("min_lon")
        if minimum is not None and value <= minimum:
            raise ValueError("max_lon must be greater than min_lon")
        return value

    @field_validator("max_lat")
    @classmethod
    def _lat_order(cls, value: float, info: Any) -> float:
        minimum = info.data.get("min_lat")
        if minimum is not None and value <= minimum:
            raise ValueError("max_lat must be greater than min_lat")
        return value


class SnapRequest(BaseModel):
    lon: float = Field(..., ge=-180, le=180)
    lat: float = Field(..., ge=-90, le=90)
