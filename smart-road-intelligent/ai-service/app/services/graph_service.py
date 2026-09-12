"""Builds the routable Mogadishu road network from the prepared ML dataset.

The dataset shipped from the Colab phase is not only training rows: each row
carries the real OSM geometry of one road segment (start/end lon-lat, length,
class, surface, lane count). This module turns those rows into a routable graph.
No geometry is invented anywhere.

Two representations are kept:

* a `networkx.DiGraph` used for structural analysis (components, degree, stats)
* flat adjacency lists used by the A* hot loop, which is materially faster than
  traversing NetworkX attribute dictionaries per expansion
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any

import networkx as nx
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

from app.core.config import get_settings
from app.services import congestion
from app.services.congestion import CongestionContext
from app.services.model_service import ModelService

log = logging.getLogger(__name__)

# The reference slice the shipped model was trained on. Dividing the model's
# output by the profile's own value at this slice recovers an uncongested
# free-flow speed, and guarantees that re-scoring at this exact slice reproduces
# the model output unchanged. See `RoadNetwork._derive_free_flow`.
REFERENCE_SLICE = CongestionContext(hour=8, day_of_week=1, precipitation_mm=0.0)

COORD_PRECISION = 7

# Radius used to measure how exposed a segment is to the major-road corridor
# network, and the road class that counts as 'major' for that measurement.
CORRIDOR_RADIUS_M = 500.0
MAJOR_CLASS_THRESHOLD = 0.7
METERS_PER_DEG_LAT = 110_574.0
METERS_PER_DEG_LON_AT_EQUATOR = 111_320.0

STATIC_FEATURE_COLUMNS = (
    "road_class_score",
    "surface_quality_score",
    "lanes_numeric",
    "road_length_m",
    "base_speed_kmh",
    "base_time_minutes",
    "surface_penalty",
    "routing_cost",
    "start_lon",
    "start_lat",
    "end_lon",
    "end_lat",
    "centroid_lon",
    "centroid_lat",
)

# Human labels for the discrete road_class_score values present in the network.
ROAD_CLASS_LABELS: dict[float, str] = {
    1.0: "Trunk",
    0.85: "Primary",
    0.7: "Secondary",
    0.5: "Tertiary",
    0.4: "Unclassified",
    0.35: "Residential",
    0.2: "Service / track",
}

SURFACE_LABELS: dict[float, str] = {
    1.0: "Paved - good",
    0.5: "Paved - worn",
    0.35: "Compacted / gravel",
    0.2: "Unpaved",
}


def label_for(table: dict[float, str], score: float, fallback: str) -> str:
    if not table:
        return fallback
    nearest = min(table, key=lambda key: abs(key - score))
    return table[nearest] if abs(nearest - score) < 0.06 else fallback


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in metres."""
    radius = 6_371_008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_phi = p2 - p1
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


@dataclass
class NearestNode:
    node: int
    lon: float
    lat: float
    distance_m: float


class RoadNetwork:
    """The loaded, scored, routable network. Built once at service start."""

    def __init__(self, model: ModelService) -> None:
        self._settings = get_settings()
        self._model = model
        self.build_warnings: list[str] = []
        self._load()

    # ----------------------------------------------------------------- build

    def _load(self) -> None:
        path = self._settings.network_csv_path
        log.info("Loading road network from %s", path)
        frame = pd.read_csv(path)

        missing = [column for column in STATIC_FEATURE_COLUMNS if column not in frame.columns]
        if missing:
            raise RuntimeError(f"Network dataset is missing required columns: {missing}")

        for column in ("start_lon", "start_lat", "end_lon", "end_lat"):
            frame[column] = frame[column].round(COORD_PRECISION)

        # One physical segment may appear in several training rows; the geometry
        # and road attributes are identical, so keep the first occurrence.
        before = len(frame)
        frame = frame.drop_duplicates(subset=["start_lon", "start_lat", "end_lon", "end_lat"])
        frame = frame[
            (frame.start_lon != frame.end_lon) | (frame.start_lat != frame.end_lat)
        ].reset_index(drop=True)
        if len(frame) != before:
            log.info("Collapsed %d duplicate/degenerate segment rows", before - len(frame))

        # Order matters: the spatial index produces `corridor_exposure`, which
        # `_score_edges` needs to derive free-flow speeds from the model output.
        self._index_nodes(frame)
        self._index_edges(frame)
        self._build_spatial_index()
        self._score_edges(frame)
        self._build_graphs()
        self._compute_stats()

    def _index_nodes(self, frame: pd.DataFrame) -> None:
        starts = frame[["start_lon", "start_lat"]].to_numpy()
        ends = frame[["end_lon", "end_lat"]].to_numpy()
        coords = np.vstack([starts, ends])
        unique, inverse = np.unique(coords, axis=0, return_inverse=True)
        self.node_coords: np.ndarray = unique  # (N, 2) as [lon, lat]
        half = len(frame)
        self._edge_u = inverse[:half].astype(np.int32)
        self._edge_v = inverse[half:].astype(np.int32)
        log.info("Indexed %d unique nodes", len(unique))

    def _index_edges(self, frame: pd.DataFrame) -> None:
        self.edge_length_m = frame["road_length_m"].to_numpy(dtype=np.float64)
        self.edge_road_class = frame["road_class_score"].to_numpy(dtype=np.float64)
        self.edge_surface = frame["surface_quality_score"].to_numpy(dtype=np.float64)
        self.edge_lanes = frame["lanes_numeric"].to_numpy(dtype=np.float64)
        self.edge_base_speed = frame["base_speed_kmh"].to_numpy(dtype=np.float64)
        self.edge_count = len(frame)

    def _score_edges(self, frame: pd.DataFrame) -> None:
        """Run the ML model across every segment once, at service start.

        Batch-scoring here is valid because the model's output depends only on
        static road features - verified, not assumed, by the temporal
        sensitivity probe in ModelService. If the model is ever retrained on
        varied time data the probe reports it and this cache is rebuilt per
        request context instead (see `RoadNetwork.requires_per_request_scoring`).
        """
        static_rows = frame[list(STATIC_FEATURE_COLUMNS)].to_dict("records")
        self._static_rows_sample = static_rows[:512]

        matrix = self._model.build_matrix(static_rows, {})
        log.info("Scoring %d segments with the traffic model", len(static_rows))
        mean, dispersion = self._model.predict_with_dispersion(matrix)

        self.model_speed_kmh = np.clip(mean, 1.0, 200.0)
        self.model_dispersion_kmh = dispersion

        # Every tree in the forest returns the same value for every segment,
        # because the prototype target is a deterministic multiple of
        # base_speed_kmh. Dispersion therefore carries no information and must
        # not be presented as a reliability signal - the routing scorer drops
        # the term and the UI states why.
        self.dispersion_is_degenerate = bool(np.ptp(dispersion) < 1e-9)
        self.dispersion_note = (
            "Per-tree dispersion is identical (%.4f km/h) across every segment. The forest "
            "agrees perfectly because the prototype target is a deterministic function of "
            "base_speed_kmh, so this measures label determinism, not real-world reliability. "
            "It is excluded from route scoring." % float(dispersion.mean())
            if bool(np.ptp(dispersion) < 1e-9)
            else "Per-tree dispersion varies across segments and is used as a route-scoring term."
        )
        if self.dispersion_is_degenerate:
            self.build_warnings.append(self.dispersion_note)

        self.card = self._model.build_card(static_rows)
        self.requires_per_request_scoring = bool(
            self.card.temporal_sensitivity.get("model_responds_to_time_or_weather")
        )
        if self.requires_per_request_scoring:
            self.build_warnings.append(
                "Model responds to time/weather inputs; cached segment scores are refreshed per request."
            )
        self._derive_free_flow()

    def _derive_free_flow(self) -> None:
        """Recover an uncongested reference speed from the model output.

        The model was trained on a congested slice (weekday 08:00), so its raw
        output already contains that slice's congestion. Dividing by the
        profile's own retention at the same slice yields a free-flow speed such
        that re-scoring at weekday 08:00 reproduces the model output exactly.
        """
        retention = congestion.segment_retention_array(
            REFERENCE_SLICE, self.edge_road_class, self.edge_surface, self.corridor_exposure
        )
        self._reference_retention = retention
        self.free_flow_kmh = self.model_speed_kmh / retention

    def _build_graphs(self) -> None:
        """Create the NetworkX view and the flat adjacency used by A*.

        The prepared dataset carries no one-way flag, so segments are traversable
        in both directions. This is stated as a known limitation rather than
        silently assumed correct.
        """
        self.build_warnings.append(
            "The prepared network has no one-way attribute; all segments are treated as "
            "bidirectional. Turn restrictions are not modelled."
        )
        graph = nx.DiGraph()
        graph.add_nodes_from(range(len(self.node_coords)))
        adjacency: list[list[tuple[int, int]]] = [[] for _ in range(len(self.node_coords))]
        for edge_index in range(self.edge_count):
            u = int(self._edge_u[edge_index])
            v = int(self._edge_v[edge_index])
            length = float(self.edge_length_m[edge_index])
            graph.add_edge(u, v, edge_index=edge_index, length_m=length)
            graph.add_edge(v, u, edge_index=edge_index, length_m=length)
            adjacency[u].append((v, edge_index))
            adjacency[v].append((u, edge_index))
        self.graph = graph
        self.adjacency = adjacency

    def _build_spatial_index(self) -> None:
        """KD-tree over locally projected coordinates for nearest-node snapping."""
        lat0 = float(np.mean(self.node_coords[:, 1]))
        self._lat0 = lat0
        self._lon_scale = METERS_PER_DEG_LON_AT_EQUATOR * math.cos(math.radians(lat0))
        self._lon0 = float(np.mean(self.node_coords[:, 0]))
        projected = np.column_stack(
            [
                (self.node_coords[:, 0] - self._lon0) * self._lon_scale,
                (self.node_coords[:, 1] - lat0) * METERS_PER_DEG_LAT,
            ]
        )
        self._projected = projected
        self.kdtree = cKDTree(projected)
        self._compute_corridor_exposure()

    def _compute_corridor_exposure(self) -> None:
        """Per-segment exposure to the major-road corridor network, in [0, 1].

        Measured directly from the prepared extract: for every segment, the total
        length of trunk/primary/secondary road within `CORRIDOR_RADIUS_M` of its
        midpoint. High values mark the city core and the main arteries, where
        congestion concentrates. Scaled against the 95th percentile so a handful
        of extreme cells do not flatten the rest of the range.
        """
        mid_x = (self._projected[self._edge_u, 0] + self._projected[self._edge_v, 0]) / 2
        mid_y = (self._projected[self._edge_u, 1] + self._projected[self._edge_v, 1]) / 2
        midpoints = np.column_stack([mid_x, mid_y])

        major = self.edge_road_class >= MAJOR_CLASS_THRESHOLD
        if not major.any():
            self.corridor_exposure = np.zeros(self.edge_count)
            return

        major_tree = cKDTree(midpoints[major])
        major_lengths = self.edge_length_m[major]
        neighbours = major_tree.query_ball_point(midpoints, r=CORRIDOR_RADIUS_M)
        density = np.fromiter(
            (major_lengths[idx].sum() if idx else 0.0 for idx in neighbours),
            dtype=np.float64,
            count=self.edge_count,
        )

        ceiling = float(np.percentile(density, 95))
        self.corridor_exposure = (
            np.clip(density / ceiling, 0.0, 1.0) if ceiling > 0 else np.zeros(self.edge_count)
        )
        self.corridor_density_m = density
        log.info(
            "Corridor exposure: mean %.3f, p95 density %.0f m of major road within %dm",
            float(self.corridor_exposure.mean()),
            ceiling,
            int(CORRIDOR_RADIUS_M),
        )

    def _compute_stats(self) -> None:
        undirected = self.graph.to_undirected(as_view=False)
        components = sorted(nx.connected_components(undirected), key=len, reverse=True)
        self.largest_component: set[int] = set(components[0]) if components else set()
        lengths = self.edge_length_m
        self.stats: dict[str, Any] = {
            "nodes": int(len(self.node_coords)),
            "segments": int(self.edge_count),
            "total_length_km": round(float(lengths.sum()) / 1000, 1),
            "median_segment_length_m": round(float(np.median(lengths)), 1),
            "connected_components": len(components),
            "largest_component_nodes": len(self.largest_component),
            "largest_component_share": round(len(self.largest_component) / max(1, len(self.node_coords)), 4),
            "bounds": {
                "min_lon": float(self.node_coords[:, 0].min()),
                "max_lon": float(self.node_coords[:, 0].max()),
                "min_lat": float(self.node_coords[:, 1].min()),
                "max_lat": float(self.node_coords[:, 1].max()),
            },
            "road_class_distribution": self._distribution(self.edge_road_class, ROAD_CLASS_LABELS),
            "surface_distribution": self._distribution(self.edge_surface, SURFACE_LABELS),
        }
        log.info("Network ready: %s", self.stats)

    def _distribution(self, values: np.ndarray, labels: dict[float, str]) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        unique, counts = np.unique(values, return_counts=True)
        total_length = float(self.edge_length_m.sum())
        for value, count in zip(unique, counts):
            mask = values == value
            km = float(self.edge_length_m[mask].sum()) / 1000
            result.append(
                {
                    "score": round(float(value), 2),
                    "label": label_for(labels, float(value), f"Score {value:.2f}"),
                    "segments": int(count),
                    "length_km": round(km, 1),
                    "share": round(float(self.edge_length_m[mask].sum()) / total_length, 4),
                }
            )
        return sorted(result, key=lambda item: item["score"], reverse=True)

    # --------------------------------------------------------------- scoring

    def effective_speeds(self, context: CongestionContext) -> np.ndarray:
        """Speed per segment under the given time/weather context, in km/h."""
        return np.clip(self.free_flow_kmh * self.retention_array(context), 2.0, 200.0)

    def retention_array(self, context: CongestionContext) -> np.ndarray:
        """Per-segment speed retention under the given context."""
        return congestion.segment_retention_array(
            context, self.edge_road_class, self.edge_surface, self.corridor_exposure
        )

    def travel_times_minutes(self, speeds_kmh: np.ndarray) -> np.ndarray:
        return (self.edge_length_m / 1000.0) / speeds_kmh * 60.0

    # --------------------------------------------------------------- lookups

    def nearest_node(self, lon: float, lat: float, routable_only: bool = True) -> NearestNode:
        """Snap a coordinate to the closest network node.

        When `routable_only` is set, results are restricted to the largest
        connected component so a route always exists between two snapped points.
        """
        x = (lon - self._lon0) * self._lon_scale
        y = (lat - self._lat0) * METERS_PER_DEG_LAT
        k = 1 if not routable_only else 24
        distances, indices = self.kdtree.query([x, y], k=k)
        candidates = np.atleast_1d(indices)
        dists = np.atleast_1d(distances)
        for candidate, distance in zip(candidates, dists):
            node = int(candidate)
            if not routable_only or node in self.largest_component:
                coord = self.node_coords[node]
                return NearestNode(node, float(coord[0]), float(coord[1]), float(distance))
        node = int(candidates[0])
        coord = self.node_coords[node]
        return NearestNode(node, float(coord[0]), float(coord[1]), float(dists[0]))

    def node_lonlat(self, node: int) -> tuple[float, float]:
        coord = self.node_coords[node]
        return float(coord[0]), float(coord[1])

    def straight_line_m(self, node_a: int, node_b: int) -> float:
        ax, ay = self._projected[node_a]
        bx, by = self._projected[node_b]
        return float(math.hypot(ax - bx, ay - by))

    def edge_descriptor(self, edge_index: int) -> dict[str, Any]:
        return {
            "road_class": label_for(ROAD_CLASS_LABELS, float(self.edge_road_class[edge_index]), "Road"),
            "road_class_score": round(float(self.edge_road_class[edge_index]), 2),
            "surface": label_for(SURFACE_LABELS, float(self.edge_surface[edge_index]), "Unknown surface"),
            "surface_score": round(float(self.edge_surface[edge_index]), 2),
            "lanes": int(self.edge_lanes[edge_index]),
            "length_m": round(float(self.edge_length_m[edge_index]), 1),
        }
