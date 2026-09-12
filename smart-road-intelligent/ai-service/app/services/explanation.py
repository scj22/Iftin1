"""Generates the 'why this route' explanation from measured route data.

Every sentence produced here is derived from numbers the routing pass actually
computed. Nothing is templated in unless the underlying comparison is true, so
a route that wins on quality while losing on time says exactly that.
"""
from __future__ import annotations

from typing import Any

from app.services.congestion import CongestionContext

TRAFFIC_PHRASES = {
    "LOW": "light predicted congestion",
    "MEDIUM": "moderate predicted congestion",
    "HIGH": "heavy predicted congestion",
}


def _quality_word(score: float) -> str:
    if score >= 0.8:
        return "well-surfaced"
    if score >= 0.55:
        return "mostly paved"
    if score >= 0.35:
        return "mixed-surface"
    return "largely unpaved"


def build_explanation(
    routes: list[dict[str, Any]],
    context: CongestionContext,
    model_is_time_aware: bool,
    dispersion_degenerate: bool = False,
    score_terms: list[str] | None = None,
) -> dict[str, Any]:
    best = routes[0]
    others = routes[1:]
    factors: list[dict[str, Any]] = []
    score_terms = score_terms or list(best.get("score_breakdown", {}))

    fastest = min(routes, key=lambda route: route["duration_minutes"])
    time_gap = round(best["duration_minutes"] - fastest["duration_minutes"], 1)

    # --- travel time -------------------------------------------------------
    if others:
        next_best = min(others, key=lambda route: route["duration_minutes"])
        saving = round(next_best["duration_minutes"] - best["duration_minutes"], 1)
        if saving > 0.5:
            factors.append(
                {
                    "label": "Faster arrival",
                    "detail": (
                        f"Arrives about {saving:g} min sooner than the next best option "
                        f"({best['duration_minutes']:g} min versus {next_best['duration_minutes']:g} min)."
                    ),
                    "impact": "positive",
                    "value": f"-{saving:g} min",
                }
            )
        elif time_gap > 0.5:
            factors.append(
                {
                    "label": "Slightly slower, better road",
                    "detail": (
                        f"Takes {time_gap:g} min longer than the quickest option, but wins on "
                        "road quality and predicted congestion."
                    ),
                    "impact": "negative",
                    "value": f"+{time_gap:g} min",
                }
            )
        else:
            factors.append(
                {
                    "label": "Comparable travel time",
                    "detail": (
                        f"Travel time is within {abs(saving):g} min of the alternatives, so the "
                        "ranking is decided by congestion and road quality."
                    ),
                    "impact": "neutral",
                    "value": f"{best['duration_minutes']:g} min",
                }
            )

    # --- congestion --------------------------------------------------------
    retention_pct = round(best["speed_retention"] * 100)
    congestion_detail = (
        f"Holds about {retention_pct}% of free-flow speed at "
        f"{context.hour:02d}:00 on {context.day_label}, which the profile classes as "
        f"{best['traffic_level']} congestion."
    )
    if others:
        worst_other = min(others, key=lambda route: route["speed_retention"])
        if best["speed_retention"] - worst_other["speed_retention"] > 0.02:
            congestion_detail += (
                f" The heaviest alternative drops to {round(worst_other['speed_retention'] * 100)}%."
            )
    factors.append(
        {
            "label": "Predicted congestion",
            "detail": congestion_detail,
            "impact": "positive" if best["traffic_level"] == "LOW" else
            "neutral" if best["traffic_level"] == "MEDIUM" else "negative",
            "value": best["traffic_level"],
        }
    )

    # --- road quality ------------------------------------------------------
    quality_detail = (
        f"Runs on {_quality_word(best['road_quality_score'])} roads "
        f"(surface score {best['road_quality_score']:.2f} of 1.00)."
    )
    if others:
        best_other_quality = max(others, key=lambda route: route["road_quality_score"])
        delta = best["road_quality_score"] - best_other_quality["road_quality_score"]
        if delta > 0.03:
            quality_detail += f" That is {delta:.2f} better than any alternative."
        elif delta < -0.03:
            quality_detail += (
                f" One alternative surfaces {abs(delta):.2f} better but loses on time."
            )
    factors.append(
        {
            "label": "Road quality",
            "detail": quality_detail,
            "impact": "positive" if best["road_quality_score"] >= 0.55 else "negative",
            "value": f"{best['road_quality_score']:.2f}",
        }
    )

    # --- distance ----------------------------------------------------------
    if others:
        shortest = min(routes, key=lambda route: route["distance_km"])
        extra_km = round(best["distance_km"] - shortest["distance_km"], 2)
        if extra_km <= 0.01:
            factors.append(
                {
                    "label": "Shortest path",
                    "detail": f"Also the shortest option at {best['distance_km']:g} km.",
                    "impact": "positive",
                    "value": f"{best['distance_km']:g} km",
                }
            )
        else:
            factors.append(
                {
                    "label": "Distance trade-off",
                    "detail": (
                        f"Covers {extra_km:g} km more than the shortest option "
                        f"({best['distance_km']:g} km versus {shortest['distance_km']:g} km), "
                        "and still ranks higher overall."
                    ),
                    "impact": "neutral",
                    "value": f"+{extra_km:g} km",
                }
            )

    # --- weather -----------------------------------------------------------
    if context.precipitation_mm > 0.2:
        factors.append(
            {
                "label": "Rainfall applied",
                "detail": (
                    f"{context.precipitation_mm:.1f} mm of rain in the selected hour reduces "
                    "speeds on this route, with a larger reduction on unpaved sections."
                ),
                "impact": "negative",
                "value": f"{context.precipitation_mm:.1f} mm",
            }
        )

    # --- model agreement ---------------------------------------------------
    dispersion = best["model_dispersion_kmh"]
    if dispersion_degenerate:
        certainty = "Not measurable"
        factors.append(
            {
                "label": "Prediction certainty",
                "detail": (
                    "Not measurable on this model. Every tree in the forest returns an "
                    "identical value, because the prototype target is a fixed multiple of "
                    "the segment's base speed. That shows the labels are deterministic, "
                    "not that the prediction is reliable, so it is excluded from scoring."
                ),
                "impact": "neutral",
                "value": "n/a",
            }
        )
    else:
        certainty = dispersion_label(dispersion)
        factors.append(
            {
                "label": "Model agreement",
                "detail": (
                    f"The forest's trees disagree by {dispersion:.2f} km/h on average across "
                    f"this route's segments, which reads as {certainty.lower()} agreement. "
                    "This is a spread measure, not a calibrated confidence score."
                ),
                "impact": "positive" if certainty == "High" else "neutral",
                "value": certainty,
            }
        )

    headline = _headline(best, others, context, time_gap, score_terms)

    return {
        "headline": headline,
        "factors": factors,
        "certainty": {
            "label": certainty,
            "measurable": not dispersion_degenerate,
            "dispersion_kmh": round(dispersion, 3),
            "basis": (
                "Standard deviation of the individual regression trees' predictions across "
                "the segments on this route, length-weighted."
            ),
            "caveat": (
                "Degenerate on the shipped model: all trees agree exactly because the "
                "prototype target is deterministic. Reported as not measurable rather than "
                "as high confidence."
                if dispersion_degenerate
                else "A spread measure of internal model disagreement."
            ),
            "is_calibrated_confidence": False,
        },
        "comparisons": [
            {
                "route_id": route["id"],
                "name": route["name"],
                "extra_minutes": route["comparison_to_best"]["extra_minutes"],
                "extra_km": route["comparison_to_best"]["extra_km"],
                "traffic_level": route["traffic_level"],
                "road_quality_score": route["road_quality_score"],
                "score_gap": route["comparison_to_best"]["score_gap"],
            }
            for route in others
        ],
        "provenance": provenance(model_is_time_aware),
    }


TERM_LABELS = {
    "travel_time": "travel time",
    "traffic_level": "congestion",
    "road_quality": "road quality",
    "model_agreement": "model agreement",
}


def _term_phrase(score_terms: list[str]) -> str:
    """Name only the criteria that actually contributed to the score."""
    labels = [TERM_LABELS.get(term, term.replace("_", " ")) for term in score_terms]
    if not labels:
        return "the scoring criteria"
    if len(labels) == 1:
        return labels[0]
    return ", ".join(labels[:-1]) + " and " + labels[-1]


def _headline(
    best: dict[str, Any],
    others: list[dict[str, Any]],
    context: CongestionContext,
    time_gap: float,
    score_terms: list[str],
) -> str:
    traffic = TRAFFIC_PHRASES.get(best["traffic_level"], "predicted congestion")
    quality = _quality_word(best["road_quality_score"])

    if not others:
        return (
            f"This is the only distinct road corridor between these two points in the "
            f"prepared network. It covers {best['distance_km']:g} km of {quality} road with "
            f"{traffic} at {context.hour:02d}:00 on {context.day_label}."
        )

    if time_gap > 0.5:
        return (
            f"Smart Road recommends this route because, although it arrives {time_gap:g} min "
            f"later than the quickest option, it runs on {quality} roads with {traffic} - a "
            f"combination that scores {best['score']:g} out of 100 against the alternatives."
        )

    next_best = min(others, key=lambda route: route["duration_minutes"])
    saving = round(next_best["duration_minutes"] - best["duration_minutes"], 1)
    lead = (
        f"arrives {saving:g} min sooner than the next option"
        if saving > 0.5
        else "matches the alternatives on time"
    )
    return (
        f"Smart Road recommends this route because it {lead}, runs on {quality} roads and "
        f"carries {traffic} at {context.hour:02d}:00 on {context.day_label}. It scores "
        f"{best['score']:g} out of 100 across {_term_phrase(score_terms)}."
    )


def dispersion_label(dispersion_kmh: float) -> str:
    """Bucket per-tree disagreement into a readable agreement level."""
    if dispersion_kmh < 0.35:
        return "High"
    if dispersion_kmh < 1.5:
        return "Moderate"
    return "Low"


def provenance(model_is_time_aware: bool) -> dict[str, list[str]]:
    """States exactly which component produced which number."""
    rule_based = [
        "Time-of-day speed retention (rule-based weekly profile)",
        "Rainfall speed penalty, weighted by road surface quality",
        "Road-class weighting of peak-hour effects",
    ]
    if model_is_time_aware:
        rule_based = [
            "Road-class weighting of peak-hour effects",
            "Rainfall speed penalty, weighted by road surface quality",
        ]
    return {
        "machine_learning_model": [
            "Free-flow speed prediction per road segment (RandomForest, traffic_speed_kmh)",
        ],
        "rule_based_profile": rule_based,
        "prepared_road_network": [
            "Segment geometry, length and connectivity from the OpenStreetMap extract",
            "Road class, surface quality and lane count",
        ],
        "not_available": [
            "Live traffic observations or floating-car data",
            "Incident, roadworks and closure reports",
            "One-way restrictions and turn bans",
            "Real-time signal timing",
        ],
    }
