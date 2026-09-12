"""A* routing over the Mogadishu network, with genuine alternative routes.

Cost is predicted travel time in minutes, derived from the model's free-flow
speed for each segment modulated by the rule-based congestion profile. The
heuristic is straight-line distance divided by the fastest speed present in the
current scoring pass, which keeps it admissible so A* returns true optima.

Alternatives use the iterative penalty method: after a route is found its edges
are made more expensive and the search is repeated, yielding a genuinely
different corridor rather than a cosmetic reshuffle. Candidates that overlap the
recommended route too heavily are discarded instead of padded out.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from heapq import heappop, heappush
from typing import Any

import numpy as np

from app.core.config import get_settings
from app.services import congestion
from app.services.congestion import CongestionContext
from app.services.graph_service import RoadNetwork

log = logging.getLogger(__name__)

# Multiplier applied to the edges of an already-returned route when searching
# for the next alternative.
ALTERNATIVE_PENALTY = 1.9

# Composite route score weights. Published through the API so the ranking is
# auditable rather than a black box.
SCORE_WEIGHTS: dict[str, float] = {
    "travel_time": 0.50,
    "traffic_level": 0.20,
    "road_quality": 0.20,
    "model_agreement": 0.10,
}

ROUTE_NAMES = ("Recommended", "Alternative 1", "Alternative 2", "Alternative 3")


class RouteNotFound(Exception):
    pass


@dataclass
class RouteCandidate:
    nodes: list[int]
    edges: list[int]
    distance_m: float
    duration_min: float
    free_flow_duration_min: float
    mean_speed_kmh: float
    retention: float
    road_quality: float
    dispersion_kmh: float
    traffic_level: str
    coordinates: list[list[float]] = field(default_factory=list)
    steps: list[dict[str, Any]] = field(default_factory=list)
    score: float = 0.0
    score_breakdown: dict[str, float] = field(default_factory=dict)


class RoutingService:
    def __init__(self, network: RoadNetwork) -> None:
        self.network = network
        self._settings = get_settings()

    # ------------------------------------------------------------ public API

    def find_routes(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
        context: CongestionContext,
        alternatives: int | None = None,
    ) -> dict[str, Any]:
        network = self.network
        wanted = self._settings.alternative_count if alternatives is None else alternatives

        start = network.nearest_node(origin[0], origin[1])
        end = network.nearest_node(destination[0], destination[1])
        if start.node == end.node:
            raise RouteNotFound("Origin and destination snap to the same point on the road network.")

        speeds = network.effective_speeds(context)
        times = network.travel_times_minutes(speeds)
        max_speed = float(speeds.max())

        candidates: list[RouteCandidate] = []
        penalties = np.ones(network.edge_count, dtype=np.float64)

        for attempt in range(wanted + 1):
            path = self._astar(start.node, end.node, times, penalties, max_speed)
            if path is None:
                break
            nodes, edges = path
            candidate = self._describe(nodes, edges, speeds, times, context)
            if attempt == 0 or self._is_distinct(candidate, candidates):
                candidates.append(candidate)
            penalties[edges] *= ALTERNATIVE_PENALTY

        if not candidates:
            raise RouteNotFound(
                "No connected road path exists between these points in the prepared network."
            )

        self._score(candidates)
        candidates.sort(key=lambda item: item.score, reverse=True)

        routes: list[dict[str, Any]] = []
        for index, candidate in enumerate(candidates):
            routes.append(self._serialise(candidate, index, candidates[0]))

        return {
            "routes": routes,
            "snapping": {
                "origin": {
                    "requested": {"lon": origin[0], "lat": origin[1]},
                    "snapped": {"lon": start.lon, "lat": start.lat},
                    "offset_m": round(start.distance_m, 1),
                },
                "destination": {
                    "requested": {"lon": destination[0], "lat": destination[1]},
                    "snapped": {"lon": end.lon, "lat": end.lat},
                    "offset_m": round(end.distance_m, 1),
                },
            },
            "scoring": {
                "weights": self.active_weights(),
                "declared_weights": SCORE_WEIGHTS,
                "description": (
                    "Each candidate is normalised against the other candidates on the "
                    "measured quantities above, then combined with those weights. The "
                    "highest total is recommended."
                ),
                "dispersion_note": getattr(self.network, "dispersion_note", None),
            },
        }

    # ------------------------------------------------------------------ A*

    def _astar(
        self,
        source: int,
        target: int,
        times: np.ndarray,
        penalties: np.ndarray,
        max_speed_kmh: float,
    ) -> tuple[list[int], list[int]] | None:
        network = self.network
        adjacency = network.adjacency
        limit_m = self._settings.max_route_distance_km * 1000

        def heuristic(node: int) -> float:
            metres = network.straight_line_m(node, target)
            return (metres / 1000.0) / max_speed_kmh * 60.0

        best_cost: dict[int, float] = {source: 0.0}
        came_from: dict[int, tuple[int, int]] = {}
        visited: set[int] = set()
        heap: list[tuple[float, int]] = [(heuristic(source), source)]

        while heap:
            _, node = heappop(heap)
            if node in visited:
                continue
            if node == target:
                return self._reconstruct(came_from, source, target)
            visited.add(node)
            node_cost = best_cost[node]

            for neighbour, edge_index in adjacency[node]:
                if neighbour in visited:
                    continue
                step = float(times[edge_index]) * float(penalties[edge_index])
                tentative = node_cost + step
                if tentative < best_cost.get(neighbour, float("inf")):
                    best_cost[neighbour] = tentative
                    came_from[neighbour] = (node, edge_index)
                    heappush(heap, (tentative + heuristic(neighbour), neighbour))

            if network.straight_line_m(source, node) > limit_m:
                break

        return None

    def _reconstruct(
        self, came_from: dict[int, tuple[int, int]], source: int, target: int
    ) -> tuple[list[int], list[int]]:
        nodes = [target]
        edges: list[int] = []
        cursor = target
        while cursor != source:
            previous, edge_index = came_from[cursor]
            edges.append(edge_index)
            nodes.append(previous)
            cursor = previous
        nodes.reverse()
        edges.reverse()
        return nodes, edges

    # ------------------------------------------------------------ describing

    def _describe(
        self,
        nodes: list[int],
        edges: list[int],
        speeds: np.ndarray,
        times: np.ndarray,
        context: CongestionContext,
    ) -> RouteCandidate:
        network = self.network
        edge_array = np.asarray(edges, dtype=np.int64)
        lengths = network.edge_length_m[edge_array]
        distance_m = float(lengths.sum())
        duration_min = float(times[edge_array].sum())
        free_flow_min = float(
            ((lengths / 1000.0) / network.free_flow_kmh[edge_array] * 60.0).sum()
        )
        weight = lengths / max(distance_m, 1e-9)
        mean_speed = distance_m / 1000.0 / max(duration_min / 60.0, 1e-9)
        retention = float(
            (speeds[edge_array] / network.free_flow_kmh[edge_array] * weight).sum()
        )
        road_quality = float((network.edge_surface[edge_array] * weight).sum())
        dispersion = float((network.model_dispersion_kmh[edge_array] * weight).sum())

        return RouteCandidate(
            nodes=nodes,
            edges=edges,
            distance_m=distance_m,
            duration_min=duration_min,
            free_flow_duration_min=free_flow_min,
            mean_speed_kmh=mean_speed,
            retention=retention,
            road_quality=road_quality,
            dispersion_kmh=dispersion,
            traffic_level=congestion.classify_level(retention),
            coordinates=[list(network.node_lonlat(node)) for node in nodes],
            steps=self._build_steps(nodes, edges, speeds),
        )

    def _build_steps(
        self, nodes: list[int], edges: list[int], speeds: np.ndarray
    ) -> list[dict[str, Any]]:
        """Group consecutive segments sharing a road class and surface into legs.

        Each leg reports its own length-weighted speed and the congestion level
        implied by that speed relative to the same stretch running free-flow.
        """
        network = self.network
        legs: list[dict[str, Any]] = []

        for edge_index in edges:
            descriptor = network.edge_descriptor(edge_index)
            length = descriptor["length_m"]
            speed = float(speeds[edge_index])
            free_flow = float(network.free_flow_kmh[edge_index])

            if (
                legs
                and legs[-1]["road_class"] == descriptor["road_class"]
                and legs[-1]["surface"] == descriptor["surface"]
            ):
                leg = legs[-1]
            else:
                leg = {
                    "road_class": descriptor["road_class"],
                    "surface": descriptor["surface"],
                    "lanes": descriptor["lanes"],
                    "distance_m": 0.0,
                    "_speed_sum": 0.0,
                    "_free_flow_sum": 0.0,
                }
                legs.append(leg)

            leg["distance_m"] += length
            leg["_speed_sum"] += speed * length
            leg["_free_flow_sum"] += free_flow * length

        finished: list[dict[str, Any]] = []
        for leg in legs:
            distance = max(leg["distance_m"], 1e-6)
            speed = leg.pop("_speed_sum") / distance
            free_flow = leg.pop("_free_flow_sum") / distance
            leg["distance_m"] = round(leg["distance_m"], 1)
            leg["speed_kmh"] = round(speed, 1)
            leg["duration_min"] = round(distance / 1000.0 / max(speed, 1e-6) * 60.0, 2)
            leg["traffic_level"] = congestion.classify_level(speed / max(free_flow, 1e-6))
            finished.append(leg)

        # Legs shorter than 120 m add noise to the UI; fold them into the previous leg.
        merged: list[dict[str, Any]] = []
        for leg in finished:
            if merged and leg["distance_m"] < 120:
                previous = merged[-1]
                previous["distance_m"] = round(previous["distance_m"] + leg["distance_m"], 1)
                previous["duration_min"] = round(previous["duration_min"] + leg["duration_min"], 2)
            else:
                merged.append(leg)
        return merged

    # -------------------------------------------------------------- ranking

    def _is_distinct(self, candidate: RouteCandidate, existing: list[RouteCandidate]) -> bool:
        network = self.network
        candidate_edges = set(candidate.edges)
        candidate_length = candidate.distance_m
        for other in existing:
            shared = candidate_edges & set(other.edges)
            if not shared:
                continue
            shared_length = float(network.edge_length_m[np.asarray(list(shared), dtype=np.int64)].sum())
            if shared_length / max(candidate_length, 1e-9) > self._settings.max_route_overlap:
                return False
        return True

    def _score(self, candidates: list[RouteCandidate]) -> None:
        """Normalise each measured quantity across candidates, then combine."""

        def normalise(values: list[float], higher_is_better: bool) -> list[float]:
            low, high = min(values), max(values)
            if high - low < 1e-9:
                return [1.0] * len(values)
            if higher_is_better:
                return [(value - low) / (high - low) for value in values]
            return [1.0 - (value - low) / (high - low) for value in values]

        weights = self.active_weights()
        components = {
            "travel_time": normalise([c.duration_min for c in candidates], higher_is_better=False),
            "traffic_level": normalise([c.retention for c in candidates], higher_is_better=True),
            "road_quality": normalise([c.road_quality for c in candidates], higher_is_better=True),
        }
        if "model_agreement" in weights:
            components["model_agreement"] = normalise(
                [c.dispersion_kmh for c in candidates], higher_is_better=False
            )

        for index, candidate in enumerate(candidates):
            parts = {key: values[index] for key, values in components.items()}
            candidate.score_breakdown = {key: round(value, 4) for key, value in parts.items()}
            candidate.score = round(
                100.0 * sum(weights[key] * value for key, value in parts.items()), 1
            )

    def active_weights(self) -> dict[str, float]:
        """Scoring weights in force for this network.

        When the forest's per-tree dispersion is degenerate the model-agreement
        term is dropped rather than left in as a constant, and its weight is
        redistributed proportionally across the remaining terms.
        """
        if not getattr(self.network, "dispersion_is_degenerate", False):
            return dict(SCORE_WEIGHTS)
        kept = {k: v for k, v in SCORE_WEIGHTS.items() if k != "model_agreement"}
        total = sum(kept.values())
        return {key: round(value / total, 4) for key, value in kept.items()}

    def _serialise(
        self, candidate: RouteCandidate, index: int, best: RouteCandidate
    ) -> dict[str, Any]:
        delay = candidate.duration_min - candidate.free_flow_duration_min
        return {
            "id": f"route-{index}",
            "name": ROUTE_NAMES[index] if index < len(ROUTE_NAMES) else f"Alternative {index}",
            "is_recommended": index == 0,
            "distance_km": round(candidate.distance_m / 1000.0, 2),
            "duration_minutes": round(candidate.duration_min, 1),
            "free_flow_duration_minutes": round(candidate.free_flow_duration_min, 1),
            "delay_minutes": round(max(delay, 0.0), 1),
            "mean_speed_kmh": round(candidate.mean_speed_kmh, 1),
            "traffic_level": candidate.traffic_level,
            "speed_retention": round(candidate.retention, 3),
            "road_quality_score": round(candidate.road_quality, 3),
            "model_dispersion_kmh": round(candidate.dispersion_kmh, 3),
            "score": candidate.score,
            "score_breakdown": candidate.score_breakdown,
            "segment_count": len(candidate.edges),
            "geometry": {
                "type": "LineString",
                "coordinates": [[round(lon, 6), round(lat, 6)] for lon, lat in candidate.coordinates],
            },
            "steps": candidate.steps,
            "comparison_to_best": {
                "extra_minutes": round(candidate.duration_min - best.duration_min, 1),
                "extra_km": round((candidate.distance_m - best.distance_m) / 1000.0, 2),
                "score_gap": round(best.score - candidate.score, 1),
            },
        }
