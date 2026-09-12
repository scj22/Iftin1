"""Tests for the invariants Smart Road's correctness and honesty depend on.

Run with:  .venv/Scripts/python -m pytest tests -q
"""
from __future__ import annotations

import math

import numpy as np
import pytest

from app.services import congestion
from app.services.congestion import CongestionContext
from app.services.explanation import build_explanation
from app.services.graph_service import REFERENCE_SLICE
from app.state import build_state


@pytest.fixture(scope="session")
def state():
    return build_state()


# --------------------------------------------------------------- congestion


def test_scalar_and_vector_retention_agree(state):
    """The two implementations of the profile must never drift apart."""
    network = state.network
    context = CongestionContext(hour=17, day_of_week=1, precipitation_mm=6.0)

    vector = congestion.segment_retention_array(
        context, network.edge_road_class, network.edge_surface, network.corridor_exposure
    )
    sample = np.random.default_rng(0).choice(network.edge_count, 400, replace=False)
    scalar = np.array(
        [
            congestion.segment_retention(
                context,
                network.edge_road_class[i],
                network.edge_surface[i],
                network.corridor_exposure[i],
            )
            for i in sample
        ]
    )
    assert np.max(np.abs(scalar - vector[sample])) < 1e-12


def test_reference_slice_reproduces_model_output(state):
    """Re-scoring at the training slice must return the model's own prediction.

    This is what makes the free-flow derivation defensible rather than a fudge.
    """
    network = state.network
    effective = network.effective_speeds(REFERENCE_SLICE)
    assert np.max(np.abs(effective - network.model_speed_kmh)) < 1e-9


def test_retention_is_bounded_everywhere(state):
    network = state.network
    for hour in range(24):
        for day in range(7):
            for rain in (0.0, 3.0, 40.0):
                retention = network.retention_array(
                    CongestionContext(hour=hour, day_of_week=day, precipitation_mm=rain)
                )
                assert retention.min() >= 0.15
                assert retention.max() <= 1.0 + 1e-9


def test_night_is_free_flowing_and_peak_is_not(state):
    """The profile must actually produce a rush hour."""
    network = state.network
    night = network.retention_array(CongestionContext(hour=3, day_of_week=1)).mean()
    peak = network.retention_array(CongestionContext(hour=17, day_of_week=1)).mean()
    assert night > 0.98
    assert peak < 0.85
    assert night > peak


def test_friday_differs_from_workday(state):
    """Somali week structure: Friday is not a normal commuting day."""
    network = state.network
    workday = network.retention_array(CongestionContext(hour=8, day_of_week=1)).mean()
    friday = network.retention_array(CongestionContext(hour=8, day_of_week=4)).mean()
    assert friday > workday


def test_rain_slows_traffic_and_hurts_poor_surfaces_more():
    dry = congestion.rain_retention(0.0, 1.0)
    wet_good = congestion.rain_retention(10.0, 1.0)
    wet_poor = congestion.rain_retention(10.0, 0.35)
    assert dry == 1.0
    assert wet_good < dry
    assert wet_poor < wet_good


# ------------------------------------------------------------------ network


def test_network_is_largely_connected(state):
    stats = state.network.stats
    assert stats["segments"] > 30_000
    assert stats["largest_component_share"] > 0.95


def test_network_covers_mogadishu(state):
    bounds = state.network.stats["bounds"]
    assert 45.2 < bounds["min_lon"] < 45.5
    assert 1.9 < bounds["min_lat"] < 2.2


def test_corridor_exposure_is_normalised(state):
    exposure = state.network.corridor_exposure
    assert exposure.min() >= 0.0
    assert exposure.max() <= 1.0
    # It must actually vary, or it contributes nothing.
    assert exposure.std() > 0.05


# ------------------------------------------------------------------ routing


@pytest.fixture(scope="session")
def demo_plan(state):
    return state.routing.find_routes(
        (45.3047, 2.0144),  # Aden Adde International Airport
        (45.3269, 2.0469),  # Bakara Market
        CongestionContext(hour=17, day_of_week=1),
        alternatives=2,
    )


def test_routes_are_returned_and_ranked(demo_plan):
    routes = demo_plan["routes"]
    assert len(routes) >= 2
    assert routes[0]["is_recommended"] is True
    # Sorted by score, best first.
    scores = [route["score"] for route in routes]
    assert scores == sorted(scores, reverse=True)


def test_route_geometry_is_continuous(demo_plan, state):
    """Consecutive geometry points must be real adjacent network nodes."""
    coordinates = demo_plan["routes"][0]["geometry"]["coordinates"]
    assert len(coordinates) > 10
    for (lon_a, lat_a), (lon_b, lat_b) in zip(coordinates, coordinates[1:]):
        gap = math.dist((lon_a, lat_a), (lon_b, lat_b))
        # No jump larger than ~1.5 km in degrees; real segments are far shorter.
        assert gap < 0.015


def test_alternatives_are_genuinely_different(demo_plan):
    routes = demo_plan["routes"]
    if len(routes) < 2:
        pytest.skip("only one distinct corridor exists between these points")
    best = {tuple(point) for point in routes[0]["geometry"]["coordinates"]}
    for other in routes[1:]:
        points = {tuple(point) for point in other["geometry"]["coordinates"]}
        overlap = len(best & points) / max(len(points), 1)
        assert overlap < 0.95


def test_distance_and_duration_are_consistent(demo_plan):
    for route in demo_plan["routes"]:
        implied = route["distance_km"] / (route["duration_minutes"] / 60)
        assert route["mean_speed_kmh"] == pytest.approx(implied, rel=0.02)
        assert route["duration_minutes"] >= route["free_flow_duration_minutes"] - 1e-6


def test_peak_hour_is_slower_than_night(state):
    night = state.routing.find_routes(
        (45.3047, 2.0144), (45.3269, 2.0469), CongestionContext(hour=3, day_of_week=1), 0
    )["routes"][0]
    peak = state.routing.find_routes(
        (45.3047, 2.0144), (45.3269, 2.0469), CongestionContext(hour=17, day_of_week=1), 0
    )["routes"][0]
    assert peak["duration_minutes"] > night["duration_minutes"]


def test_rain_slows_the_journey(state):
    dry = state.routing.find_routes(
        (45.3047, 2.0144), (45.3269, 2.0469), CongestionContext(hour=17, day_of_week=1), 0
    )["routes"][0]
    wet = state.routing.find_routes(
        (45.3047, 2.0144),
        (45.3269, 2.0469),
        CongestionContext(hour=17, day_of_week=1, precipitation_mm=15.0),
        0,
    )["routes"][0]
    assert wet["duration_minutes"] > dry["duration_minutes"]


def test_scoring_drops_degenerate_dispersion_term(state, demo_plan):
    """A constant term must be removed, not left in as dead weight."""
    weights = demo_plan["scoring"]["weights"]
    if state.network.dispersion_is_degenerate:
        assert "model_agreement" not in weights
    assert sum(weights.values()) == pytest.approx(1.0, abs=1e-3)


# -------------------------------------------------------------- explanation


def test_explanation_is_grounded_in_the_routes(demo_plan, state):
    context = CongestionContext(hour=17, day_of_week=1)
    explanation = build_explanation(
        demo_plan["routes"],
        context,
        model_is_time_aware=False,
        dispersion_degenerate=state.network.dispersion_is_degenerate,
        score_terms=list(demo_plan["scoring"]["weights"]),
    )
    best = demo_plan["routes"][0]

    assert "Tuesday" in explanation["headline"]
    assert f"{best['score']:g}" in explanation["headline"]
    assert explanation["factors"]
    # The headline must not credit a scoring term that was not used.
    if state.network.dispersion_is_degenerate:
        assert "model agreement" not in explanation["headline"]


def test_certainty_is_not_overstated(demo_plan, state):
    explanation = build_explanation(
        demo_plan["routes"],
        CongestionContext(hour=17, day_of_week=1),
        model_is_time_aware=False,
        dispersion_degenerate=state.network.dispersion_is_degenerate,
    )
    certainty = explanation["certainty"]
    assert certainty["is_calibrated_confidence"] is False
    if state.network.dispersion_is_degenerate:
        assert certainty["measurable"] is False
        assert certainty["label"] == "Not measurable"


def test_provenance_separates_model_from_rules():
    provenance = build_explanation(
        [
            {
                "id": "route-0",
                "name": "Recommended",
                "is_recommended": True,
                "distance_km": 5.0,
                "duration_minutes": 15.0,
                "traffic_level": "MEDIUM",
                "speed_retention": 0.75,
                "road_quality_score": 0.8,
                "model_dispersion_kmh": 0.0,
                "score": 90.0,
                "score_breakdown": {},
            }
        ],
        CongestionContext(hour=8, day_of_week=1),
        model_is_time_aware=False,
    )["provenance"]

    rules = " ".join(provenance["rule_based_profile"]).lower()
    assert "time-of-day" in rules
    assert any("live traffic" in item.lower() for item in provenance["not_available"])


# ----------------------------------------------------------------- model


def test_model_card_states_its_limitations(state):
    card = state.network.card
    assert card.limitations
    joined = " ".join(card.limitations).lower()
    assert "prototype" in joined
    assert "single time slice" in joined
    # The R2 = 1.0 result must be explained, not presented as accuracy.
    assert any("r2" in item.lower() or "r²" in item.lower() for item in card.limitations)


def test_temporal_probe_measured_rather_than_assumed(state):
    sensitivity = state.network.card.temporal_sensitivity
    assert sensitivity["probed"] is True
    assert "max_delta_kmh_across_hours" in sensitivity
    assert isinstance(sensitivity["model_responds_to_time_or_weather"], bool)
