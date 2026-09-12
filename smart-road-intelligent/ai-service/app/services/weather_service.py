"""Weather context for routing requests.

Two sources, in priority order:

1. Live Open-Meteo forecast (free, no API key, no billing) when the host has
   outbound network access.
2. The prepared `mogadishu_weather_clean.csv` from the Colab phase, reduced to
   month-and-hour normals, used when live data is unavailable.

The active source is always reported back to the caller so the UI can label it.
Nothing is fabricated: if both fail, the caller is told so explicitly.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
import pandas as pd

from app.core.config import get_settings
from app.services.congestion import CongestionContext

log = logging.getLogger(__name__)

# Mogadishu is UTC+3 year round.
MOGADISHU_TZ = timezone(timedelta(hours=3))
MOGADISHU_LAT = 2.0371
MOGADISHU_LON = 45.3438

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_FIELDS = "temperature_2m,relative_humidity_2m,precipitation,rain,cloud_cover,wind_speed_10m"

# Somali seasonal calendar, used for labelling only.
SEASONS = {
    (1, 2, 3): ("Jilaal", "hot, dry season"),
    (4, 5, 6): ("Gu", "main rainy season"),
    (7, 8, 9): ("Xagaa", "cooler, windy dry season"),
    (10, 11, 12): ("Deyr", "short rainy season"),
}


def season_for(month: int) -> tuple[str, str]:
    for months, label in SEASONS.items():
        if month in months:
            return label
    return ("Unknown", "")


def now_local() -> datetime:
    return datetime.now(MOGADISHU_TZ)


class WeatherService:
    """Resolves the weather context for a given local timestamp."""

    def __init__(self) -> None:
        self._settings = get_settings()
        self._normals: pd.DataFrame | None = None
        self._live_cache: tuple[float, dict[str, Any]] | None = None
        self._load_normals()

    def _load_normals(self) -> None:
        path = self._settings.weather_csv_path
        if not path.exists():
            log.warning("Weather dataset not found at %s; normals unavailable", path)
            return
        frame = pd.read_csv(path, parse_dates=["timestamp"])
        frame["month"] = frame["timestamp"].dt.month
        numeric = [
            "temperature_c",
            "humidity_pct",
            "precipitation_mm",
            "rain_mm",
            "cloud_cover_pct",
            "wind_speed_kmh",
        ]
        self._normals = frame.groupby(["month", "hour"])[numeric].mean().reset_index()
        self._observation_span = (
            frame["timestamp"].min().date().isoformat(),
            frame["timestamp"].max().date().isoformat(),
        )
        log.info("Weather normals built from %d hourly observations", len(frame))

    # ---------------------------------------------------------------- lookup

    def normals_for(self, month: int, hour: int) -> dict[str, Any] | None:
        if self._normals is None:
            return None
        match = self._normals[
            (self._normals["month"] == month) & (self._normals["hour"] == hour)
        ]
        if match.empty:
            return None
        row = match.iloc[0]
        return {
            "temperature_c": round(float(row["temperature_c"]), 1),
            "humidity_pct": round(float(row["humidity_pct"]), 1),
            "precipitation_mm": round(float(row["precipitation_mm"]), 3),
            "rain_mm": round(float(row["rain_mm"]), 3),
            "cloud_cover_pct": round(float(row["cloud_cover_pct"]), 1),
            "wind_speed_kmh": round(float(row["wind_speed_kmh"]), 1),
        }

    async def live(self) -> dict[str, Any] | None:
        """Current-hour observation from Open-Meteo, cached for ten minutes."""
        import time

        if self._live_cache and time.time() - self._live_cache[0] < 600:
            return self._live_cache[1]
        params = {
            "latitude": MOGADISHU_LAT,
            "longitude": MOGADISHU_LON,
            "hourly": OPEN_METEO_FIELDS,
            "forecast_days": 2,
            "timezone": "Africa/Mogadishu",
        }
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                response = await client.get(OPEN_METEO_URL, params=params)
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:  # network unavailable, rate limited, etc.
            log.info("Open-Meteo unavailable (%s); falling back to prepared normals", exc)
            return None

        hourly = payload.get("hourly") or {}
        times = hourly.get("time") or []
        if not times:
            return None

        target = now_local().strftime("%Y-%m-%dT%H:00")
        index = times.index(target) if target in times else 0
        reading = {
            "temperature_c": _at(hourly, "temperature_2m", index),
            "humidity_pct": _at(hourly, "relative_humidity_2m", index),
            "precipitation_mm": _at(hourly, "precipitation", index),
            "rain_mm": _at(hourly, "rain", index),
            "cloud_cover_pct": _at(hourly, "cloud_cover", index),
            "wind_speed_kmh": _at(hourly, "wind_speed_10m", index),
            "observed_at": times[index],
        }
        self._live_cache = (time.time(), reading)
        return reading

    async def resolve(
        self,
        when: datetime,
        overrides: dict[str, float] | None = None,
        allow_live: bool = True,
    ) -> CongestionContext:
        """Build the congestion context for a timestamp, honouring overrides."""
        source = "unavailable"
        reading: dict[str, Any] | None = None

        is_current_hour = abs((when - now_local()).total_seconds()) < 3600
        if allow_live and is_current_hour:
            reading = await self.live()
            if reading:
                source = "open-meteo-live"

        if reading is None:
            reading = self.normals_for(when.month, when.hour)
            if reading:
                source = "prepared-normals-2025"

        if reading is None:
            reading = {
                "temperature_c": None,
                "humidity_pct": None,
                "precipitation_mm": 0.0,
                "rain_mm": 0.0,
                "cloud_cover_pct": None,
                "wind_speed_kmh": None,
            }
            source = "unavailable"

        merged = {**reading, **(overrides or {})}
        if overrides:
            source = f"{source}+user-override"

        precipitation = float(merged.get("precipitation_mm") or 0.0)
        return CongestionContext(
            hour=when.hour,
            day_of_week=when.weekday(),
            precipitation_mm=precipitation,
            temperature_c=_opt_float(merged.get("temperature_c")),
            humidity_pct=_opt_float(merged.get("humidity_pct")),
            cloud_cover_pct=_opt_float(merged.get("cloud_cover_pct")),
            wind_speed_kmh=_opt_float(merged.get("wind_speed_kmh")),
            weather_condition=describe(precipitation, _opt_float(merged.get("cloud_cover_pct"))),
            weather_source=source,
        )

    def source_document(self) -> dict[str, Any]:
        span = getattr(self, "_observation_span", None)
        return {
            "live_provider": "Open-Meteo forecast API (free tier, no API key, no billing)",
            "fallback": "Month-and-hour normals computed from the prepared Mogadishu weather dataset",
            "fallback_observation_span": {"from": span[0], "to": span[1]} if span else None,
            "fallback_rows": int(len(self._normals) if self._normals is not None else 0),
            "timezone": "Africa/Mogadishu (UTC+3)",
        }


def describe(precipitation_mm: float, cloud_cover_pct: float | None) -> str:
    if precipitation_mm >= 7.5:
        return "heavy rain"
    if precipitation_mm >= 2.5:
        return "rain"
    if precipitation_mm >= 0.2:
        return "light rain"
    if cloud_cover_pct is not None and cloud_cover_pct >= 70:
        return "cloudy"
    if cloud_cover_pct is not None and cloud_cover_pct >= 30:
        return "partly cloudy"
    return "clear"


def _at(hourly: dict[str, Any], key: str, index: int) -> float | None:
    values = hourly.get(key)
    if not values or index >= len(values):
        return None
    value = values[index]
    return float(value) if value is not None else None


def _opt_float(value: Any) -> float | None:
    return None if value is None else float(value)
