"""Rule-based temporal congestion profile.

This module is deliberately NOT machine learning. The shipped model was trained
on a single time slice and therefore carries no time-of-day signal (see
`ModelService.probe_temporal_sensitivity`). Rather than pretend otherwise, Smart
Road applies this transparent, inspectable profile on top of the model output
and labels the two contributions separately everywhere they surface.

Every coefficient below is a stated assumption, exposed through
`GET /api/v1/model/congestion-profile` so it can be reviewed, criticised and
replaced by observed data without touching the routing code.

Week structure follows Somali practice: Friday is the primary rest day, the
working week runs Saturday/Sunday through Thursday. day_of_week uses the Python
convention (Monday=0 ... Sunday=6), matching the prepared datasets.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import numpy as np

# Fraction of free-flow speed retained on a typical working day, by hour.
# Lower value = heavier congestion.
WORKDAY_RETENTION: tuple[float, ...] = (
    1.00, 1.00, 1.00, 1.00, 1.00, 0.97,  # 00-05 overnight, effectively free flow
    0.92, 0.78, 0.70, 0.80, 0.88, 0.88,  # 06-11 morning peak, school + work
    0.82, 0.78, 0.85, 0.88, 0.80, 0.68,  # 12-17 midday dip then evening peak
    0.70, 0.82, 0.90, 0.95, 0.99, 1.00,  # 18-23 evening unwind
)

# Friday: far lighter overall, with a pronounced midday Jumca prayer movement.
FRIDAY_RETENTION: tuple[float, ...] = (
    1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
    0.98, 0.95, 0.93, 0.94, 0.92, 0.84,
    0.74, 0.76, 0.88, 0.92, 0.90, 0.86,
    0.84, 0.88, 0.93, 0.97, 1.00, 1.00,
)

# Saturday: partial working / market day, peaks present but softened.
SATURDAY_RETENTION: tuple[float, ...] = (
    1.00, 1.00, 1.00, 1.00, 1.00, 1.00,
    0.96, 0.88, 0.82, 0.86, 0.84, 0.84,
    0.86, 0.86, 0.88, 0.88, 0.84, 0.78,
    0.80, 0.88, 0.93, 0.97, 1.00, 1.00,
)

DAY_LABELS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
FRIDAY = 4
SATURDAY = 5

# Congestion concentrates on higher-class roads: a trunk road through Km4 backs
# up long before a residential lane does. `road_class_score` runs 0.2 (minor)
# to 1.0 (trunk). This blends the hourly retention toward 1.0 for minor roads.
MINOR_ROAD_CONGESTION_SHARE = 0.35

# Congestion also concentrates spatially: the city core and the corridors around
# it carry far more of the load than the outskirts. `corridor_exposure` is a
# per-segment value in [0, 1] measured from the road network itself - the
# density of trunk/primary/secondary road length within 500 m of the segment -
# so this is derived from the real OSM extract, not asserted. It only bites
# during peaks: at 03:00, when the hourly curve is already at free flow, the
# spatial term contributes nothing.
CORRIDOR_EXPOSURE_WEIGHT = 0.45

# Rain slows traffic; unpaved and poor-surface roads suffer disproportionately
# during the Gu and Deyr rains. `surface_quality_score` runs 0.2 (poor) to 1.0.
RAIN_PENALTY_PER_MM = 0.045
MAX_RAIN_PENALTY = 0.28
POOR_SURFACE_RAIN_MULTIPLIER = 1.8

# Traffic level thresholds, expressed as the ratio of resulting speed to the
# model's free-flow baseline for the same segment.
LEVEL_THRESHOLDS = ((0.85, "LOW"), (0.68, "MEDIUM"))


@dataclass(frozen=True)
class CongestionContext:
    """The resolved time + weather context a routing request is scored against."""

    hour: int
    day_of_week: int
    precipitation_mm: float = 0.0
    temperature_c: float | None = None
    humidity_pct: float | None = None
    cloud_cover_pct: float | None = None
    wind_speed_kmh: float | None = None
    weather_condition: str = "normal"
    weather_source: str = "seasonal-normals"

    @property
    def day_label(self) -> str:
        return DAY_LABELS[self.day_of_week % 7]

    @property
    def is_rest_day(self) -> bool:
        return self.day_of_week % 7 == FRIDAY


def retention_curve(day_of_week: int) -> tuple[float, ...]:
    day = day_of_week % 7
    if day == FRIDAY:
        return FRIDAY_RETENTION
    if day == SATURDAY:
        return SATURDAY_RETENTION
    return WORKDAY_RETENTION


def base_retention(hour: int, day_of_week: int) -> float:
    return retention_curve(day_of_week)[hour % 24]


def rain_retention(precipitation_mm: float, surface_quality_score: float) -> float:
    """Speed retained under rainfall for a road of the given surface quality."""
    if precipitation_mm <= 0:
        return 1.0
    penalty = min(MAX_RAIN_PENALTY, precipitation_mm * RAIN_PENALTY_PER_MM)
    if surface_quality_score < 0.5:
        penalty = min(MAX_RAIN_PENALTY * POOR_SURFACE_RAIN_MULTIPLIER, penalty * POOR_SURFACE_RAIN_MULTIPLIER)
    return max(0.25, 1.0 - penalty)


def segment_retention(
    context: CongestionContext,
    road_class_score: float,
    surface_quality_score: float,
    corridor_exposure: float = 0.0,
) -> float:
    """Combined temporal, spatial and weather retention factor for one segment."""
    hourly = base_retention(context.hour, context.day_of_week)
    peak_intensity = 1.0 - hourly
    # Minor roads absorb only part of the peak-hour effect.
    class_weight = MINOR_ROAD_CONGESTION_SHARE + (1.0 - MINOR_ROAD_CONGESTION_SHARE) * road_class_score
    class_adjusted = 1.0 - peak_intensity * class_weight
    spatial = CORRIDOR_EXPOSURE_WEIGHT * peak_intensity * corridor_exposure
    combined = max(0.15, class_adjusted - spatial)
    return max(0.15, combined * rain_retention(context.precipitation_mm, surface_quality_score))


def segment_retention_array(
    context: CongestionContext,
    road_class: "np.ndarray",
    surface: "np.ndarray",
    corridor_exposure: "np.ndarray | None" = None,
) -> "np.ndarray":
    """Vectorised form of `segment_retention` for whole-network passes.

    Kept adjacent to the scalar version and covered by an equivalence test so
    the two cannot drift apart.
    """
    import numpy as np

    hourly = base_retention(context.hour, context.day_of_week)
    peak_intensity = 1.0 - hourly
    class_weight = MINOR_ROAD_CONGESTION_SHARE + (1.0 - MINOR_ROAD_CONGESTION_SHARE) * road_class
    class_adjusted = 1.0 - peak_intensity * class_weight
    if corridor_exposure is not None:
        class_adjusted = np.maximum(
            0.15, class_adjusted - CORRIDOR_EXPOSURE_WEIGHT * peak_intensity * corridor_exposure
        )

    if context.precipitation_mm <= 0:
        rain = np.ones_like(surface)
    else:
        penalty = np.full_like(
            surface, min(MAX_RAIN_PENALTY, context.precipitation_mm * RAIN_PENALTY_PER_MM)
        )
        poor = surface < 0.5
        penalty[poor] = np.minimum(
            MAX_RAIN_PENALTY * POOR_SURFACE_RAIN_MULTIPLIER,
            penalty[poor] * POOR_SURFACE_RAIN_MULTIPLIER,
        )
        rain = np.maximum(0.25, 1.0 - penalty)

    return np.maximum(0.15, class_adjusted * rain)


def classify_level(ratio: float) -> str:
    """Map a speed-retention ratio to LOW / MEDIUM / HIGH congestion."""
    for threshold, label in LEVEL_THRESHOLDS:
        if ratio >= threshold:
            return label
    return "HIGH"


def classify_level_array(ratios: "np.ndarray") -> "np.ndarray":
    """Vectorised form of `classify_level`."""
    import numpy as np

    labels = np.full(ratios.shape, "HIGH", dtype=object)
    labels[ratios >= LEVEL_THRESHOLDS[1][0]] = LEVEL_THRESHOLDS[1][1]
    labels[ratios >= LEVEL_THRESHOLDS[0][0]] = LEVEL_THRESHOLDS[0][1]
    return labels


def peak_windows(day_of_week: int) -> list[dict[str, Any]]:
    """Hours whose retention falls below the day's own average, grouped."""
    curve = retention_curve(day_of_week)
    average = sum(curve) / len(curve)
    windows: list[dict[str, Any]] = []
    start: int | None = None
    for hour in range(24):
        congested = curve[hour] < average - 0.03
        if congested and start is None:
            start = hour
        elif not congested and start is not None:
            windows.append(_window(curve, start, hour - 1))
            start = None
    if start is not None:
        windows.append(_window(curve, start, 23))
    return windows


def _window(curve: tuple[float, ...], start: int, end: int) -> dict[str, Any]:
    span = curve[start : end + 1]
    worst = start + span.index(min(span))
    return {
        "start_hour": start,
        "end_hour": end,
        "label": f"{start:02d}:00 - {end:02d}:59",
        "peak_hour": worst,
        "min_retention": round(min(span), 3),
    }


def profile_document() -> dict[str, Any]:
    """Full, human-readable description of this profile for the API and UI."""
    return {
        "kind": "rule-based",
        "is_machine_learning": False,
        "summary": (
            "Deterministic time-of-day and weather profile applied on top of the "
            "model's free-flow speed prediction. Published so every coefficient can "
            "be reviewed and replaced by observed traffic counts."
        ),
        "week_structure": {
            "convention": "Python weekday index, Monday=0 ... Sunday=6",
            "rest_day": "Friday",
            "working_days": ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
            "note": "Friday carries a midday Jumca prayer movement rather than commuter peaks.",
        },
        "curves": {
            "workday": list(WORKDAY_RETENTION),
            "friday": list(FRIDAY_RETENTION),
            "saturday": list(SATURDAY_RETENTION),
        },
        "peak_windows": {
            "workday": peak_windows(1),
            "friday": peak_windows(FRIDAY),
            "saturday": peak_windows(SATURDAY),
        },
        "corridor_exposure_rule": {
            "weight": CORRIDOR_EXPOSURE_WEIGHT,
            "measured_from": (
                "Density of trunk, primary and secondary road length within 500 m of each "
                "segment, taken from the prepared OpenStreetMap extract and scaled to [0, 1]."
            ),
            "description": (
                "Congestion concentrates in the city core and along major corridors. This "
                "term only applies during peaks - it scales with how congested the hour "
                "already is, so it contributes nothing at free-flow hours."
            ),
        },
        "road_class_rule": {
            "minor_road_congestion_share": MINOR_ROAD_CONGESTION_SHARE,
            "description": (
                "Peak-hour slowdown is scaled by road class. A minor road absorbs "
                f"{int(MINOR_ROAD_CONGESTION_SHARE * 100)}% of the peak effect a trunk road does."
            ),
        },
        "weather_rule": {
            "rain_penalty_per_mm": RAIN_PENALTY_PER_MM,
            "max_rain_penalty": MAX_RAIN_PENALTY,
            "poor_surface_multiplier": POOR_SURFACE_RAIN_MULTIPLIER,
            "description": (
                "Rain reduces retained speed linearly up to a cap. Roads with a surface "
                "quality score below 0.5 take a larger penalty, reflecting flooding on "
                "unpaved sections during the Gu and Deyr rains."
            ),
        },
        "traffic_levels": {
            "LOW": "retains 85% or more of free-flow speed",
            "MEDIUM": "retains 68-85% of free-flow speed",
            "HIGH": "retains less than 68% of free-flow speed",
        },
    }
