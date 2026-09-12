"""City-wide traffic intelligence derived from the scored network.

Everything here is computed from the same two components used for routing - the
model's per-segment speed and the rule-based congestion profile - so the traffic
pages and the navigation results can never disagree with each other.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from app.services import congestion
from app.services.congestion import CongestionContext
from app.services.graph_service import ROAD_CLASS_LABELS, RoadNetwork, label_for

# Segments at or above this road class carry the corridors people actually
# queue on; hotspot detection is restricted to them.
MAJOR_ROAD_MIN_CLASS = 0.7

# Hotspot grid resolution in metres. ~600 m keeps clusters at neighbourhood
# scale without merging distinct corridors.
HOTSPOT_CELL_M = 600.0


class TrafficService:
    def __init__(self, network: RoadNetwork) -> None:
        self.network = network
        self._major_mask = network.edge_road_class >= MAJOR_ROAD_MIN_CLASS
        self._cell_ids, self._cell_centroids = self._build_cells()

    # ----------------------------------------------------------------- setup

    def _build_cells(self) -> tuple[np.ndarray, dict[int, tuple[float, float]]]:
        """Assign each segment to a spatial grid cell by its midpoint."""
        network = self.network
        mid_lon = np.empty(network.edge_count)
        mid_lat = np.empty(network.edge_count)
        for index in range(network.edge_count):
            u_lon, u_lat = network.node_lonlat(int(network._edge_u[index]))
            v_lon, v_lat = network.node_lonlat(int(network._edge_v[index]))
            mid_lon[index] = (u_lon + v_lon) / 2
            mid_lat[index] = (v_lat + u_lat) / 2

        lat0 = float(mid_lat.mean())
        lon_scale = 111_320.0 * math.cos(math.radians(lat0))
        col = np.floor((mid_lon - mid_lon.min()) * lon_scale / HOTSPOT_CELL_M).astype(np.int64)
        row = np.floor((mid_lat - mid_lat.min()) * 110_574.0 / HOTSPOT_CELL_M).astype(np.int64)
        cell_ids = row * 100_000 + col

        centroids: dict[int, tuple[float, float]] = {}
        for cell in np.unique(cell_ids):
            mask = cell_ids == cell
            centroids[int(cell)] = (float(mid_lon[mask].mean()), float(mid_lat[mask].mean()))
        return cell_ids, centroids

    # -------------------------------------------------------------- snapshot

    def snapshot(self, context: CongestionContext) -> dict[str, Any]:
        network = self.network
        retention = network.retention_array(context)
        speeds = np.clip(network.free_flow_kmh * retention, 2.0, 200.0)
        lengths = network.edge_length_m
        total_length = float(lengths.sum())

        levels = congestion.classify_level_array(retention)
        distribution = []
        for level in ("LOW", "MEDIUM", "HIGH"):
            mask = levels == level
            level_length = float(lengths[mask].sum())
            distribution.append(
                {
                    "level": level,
                    "segments": int(mask.sum()),
                    "length_km": round(level_length / 1000, 1),
                    "share": round(level_length / total_length, 4) if total_length else 0.0,
                }
            )

        network_retention = float((retention * lengths).sum() / total_length)
        free_flow_minutes = float(((lengths / 1000) / network.free_flow_kmh * 60).sum())
        actual_minutes = float(((lengths / 1000) / speeds * 60).sum())

        return {
            "context": context_document(context),
            "overall": {
                "level": congestion.classify_level(network_retention),
                "speed_retention": round(network_retention, 3),
                "mean_speed_kmh": round(
                    float((speeds * lengths).sum() / total_length), 1
                ),
                "free_flow_speed_kmh": round(
                    float((network.free_flow_kmh * lengths).sum() / total_length), 1
                ),
                "network_delay_minutes": round(actual_minutes - free_flow_minutes, 0),
                "delay_share": round(
                    (actual_minutes - free_flow_minutes) / max(free_flow_minutes, 1e-9), 4
                ),
            },
            "distribution": distribution,
            "by_road_class": self._by_road_class(retention, speeds),
            "hotspots": self._hotspots(retention, speeds),
            "hourly_outlook": self.hourly_outlook(context),
        }

    def _by_road_class(self, retention: np.ndarray, speeds: np.ndarray) -> list[dict[str, Any]]:
        network = self.network
        rows: list[dict[str, Any]] = []
        for score in np.unique(network.edge_road_class):
            mask = network.edge_road_class == score
            lengths = network.edge_length_m[mask]
            weight = lengths / max(float(lengths.sum()), 1e-9)
            class_retention = float((retention[mask] * weight).sum())
            rows.append(
                {
                    "score": round(float(score), 2),
                    "label": label_for(ROAD_CLASS_LABELS, float(score), f"Score {score:.2f}"),
                    "length_km": round(float(lengths.sum()) / 1000, 1),
                    "mean_speed_kmh": round(float((speeds[mask] * weight).sum()), 1),
                    "speed_retention": round(class_retention, 3),
                    "level": congestion.classify_level(class_retention),
                }
            )
        return sorted(rows, key=lambda row: row["score"], reverse=True)

    def _hotspots(self, retention: np.ndarray, speeds: np.ndarray, limit: int = 8) -> list[dict[str, Any]]:
        """Grid cells on major roads carrying the most predicted delay.

        Delay is measured in vehicle-independent minutes: the extra time a
        single vehicle would spend traversing every major segment in the cell
        compared with free-flow. It is a concentration measure, not a count of
        real vehicles.
        """
        network = self.network
        mask = self._major_mask
        if not mask.any():
            return []

        lengths = network.edge_length_m
        free_flow_min = (lengths / 1000) / network.free_flow_kmh * 60
        actual_min = (lengths / 1000) / speeds * 60
        delay = np.where(mask, actual_min - free_flow_min, 0.0)

        cells = self._cell_ids
        results: list[dict[str, Any]] = []
        for cell in np.unique(cells[mask]):
            cell_mask = (cells == cell) & mask
            cell_delay = float(delay[cell_mask].sum())
            if cell_delay <= 0.05:
                continue
            cell_lengths = lengths[cell_mask]
            weight = cell_lengths / max(float(cell_lengths.sum()), 1e-9)
            cell_retention = float((retention[cell_mask] * weight).sum())
            lon, lat = self._cell_centroids[int(cell)]
            dominant = int(np.argmax(np.bincount((network.edge_road_class[cell_mask] * 100).astype(int))))
            results.append(
                {
                    "id": f"cell-{int(cell)}",
                    "lon": round(lon, 6),
                    "lat": round(lat, 6),
                    "delay_minutes": round(cell_delay, 1),
                    "segments": int(cell_mask.sum()),
                    "length_km": round(float(cell_lengths.sum()) / 1000, 2),
                    "mean_speed_kmh": round(float((speeds[cell_mask] * weight).sum()), 1),
                    "speed_retention": round(cell_retention, 3),
                    "level": congestion.classify_level(cell_retention),
                    "dominant_road_class": label_for(
                        ROAD_CLASS_LABELS, dominant / 100, "Major road"
                    ),
                }
            )
        results.sort(key=lambda row: row["delay_minutes"], reverse=True)
        return results[:limit]

    def hourly_outlook(self, context: CongestionContext) -> list[dict[str, Any]]:
        """Network-wide congestion across all 24 hours of the selected day."""
        network = self.network
        lengths = network.edge_length_m
        total = float(lengths.sum())
        outlook: list[dict[str, Any]] = []
        for hour in range(24):
            hour_context = CongestionContext(
                hour=hour,
                day_of_week=context.day_of_week,
                precipitation_mm=context.precipitation_mm,
            )
            retention = network.retention_array(hour_context)
            weighted = float((retention * lengths).sum() / total)
            speeds = network.free_flow_kmh * retention
            outlook.append(
                {
                    "hour": hour,
                    "label": f"{hour:02d}:00",
                    "speed_retention": round(weighted, 3),
                    "mean_speed_kmh": round(float((speeds * lengths).sum() / total), 1),
                    "level": congestion.classify_level(weighted),
                    "is_selected": hour == context.hour,
                }
            )
        return outlook

    def segments_in_view(
        self,
        context: CongestionContext,
        bounds: tuple[float, float, float, float],
        limit: int = 1200,
        min_class: float = 0.5,
    ) -> dict[str, Any]:
        """Congestion-coloured segments inside a map viewport.

        The browser never receives the whole 32k-segment network: this returns
        only what intersects the current view, highest road class first.
        """
        network = self.network
        min_lon, min_lat, max_lon, max_lat = bounds
        retention = network.retention_array(context)
        speeds = np.clip(network.free_flow_kmh * retention, 2.0, 200.0)

        features: list[dict[str, Any]] = []
        order = np.argsort(-network.edge_road_class)
        truncated = False
        for index in order:
            if network.edge_road_class[index] < min_class:
                break
            u_lon, u_lat = network.node_lonlat(int(network._edge_u[index]))
            v_lon, v_lat = network.node_lonlat(int(network._edge_v[index]))
            if max(u_lon, v_lon) < min_lon or min(u_lon, v_lon) > max_lon:
                continue
            if max(u_lat, v_lat) < min_lat or min(u_lat, v_lat) > max_lat:
                continue
            if len(features) >= limit:
                truncated = True
                break
            ratio = float(retention[index])
            features.append(
                {
                    "coordinates": [
                        [round(u_lon, 6), round(u_lat, 6)],
                        [round(v_lon, 6), round(v_lat, 6)],
                    ],
                    "level": congestion.classify_level(ratio),
                    "speed_kmh": round(float(speeds[index]), 1),
                    "road_class": label_for(
                        ROAD_CLASS_LABELS, float(network.edge_road_class[index]), "Road"
                    ),
                }
            )
        return {
            "segments": features,
            "truncated": truncated,
            "min_road_class": min_class,
            "context": context_document(context),
        }


def context_document(context: CongestionContext) -> dict[str, Any]:
    return {
        "hour": context.hour,
        "day_of_week": context.day_of_week,
        "day_label": context.day_label,
        "is_rest_day": context.is_rest_day,
        "weather": {
            "condition": context.weather_condition,
            "temperature_c": context.temperature_c,
            "humidity_pct": context.humidity_pct,
            "precipitation_mm": round(context.precipitation_mm, 2),
            "cloud_cover_pct": context.cloud_cover_pct,
            "wind_speed_kmh": context.wind_speed_kmh,
            "source": context.weather_source,
        },
    }
