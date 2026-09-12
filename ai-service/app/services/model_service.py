"""Loads and serves the traffic_prediction_model.joblib produced in Colab.

Two things matter here beyond plain inference:

1. The service reports what the model *actually* learned, not what we wish it
   learned. `probe_temporal_sensitivity` measures whether the model's output
   moves when time-of-day or weather change. On the shipped model it does not,
   because every training row carried hour=8 / day_of_week=1.
2. Uncertainty is derived from real per-tree disagreement inside the forest,
   never invented.
"""
from __future__ import annotations

import csv
import json
import logging
from dataclasses import dataclass, field
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.core.config import get_settings

log = logging.getLogger(__name__)

# Weather/time values used as the reference context when scoring the static
# network. They mirror the single slice present in the training data.
REFERENCE_CONTEXT: dict[str, float] = {
    "hour": 8.0,
    "day_of_week": 1.0,
    "temperature_c": 26.75,
    "humidity_pct": 73.4,
    "precipitation_mm": 0.06,
    "rain_mm": 0.06,
    "cloud_cover_pct": 54.1,
    "wind_speed_kmh": 17.8,
}

CONTEXT_FEATURES = set(REFERENCE_CONTEXT)


@dataclass
class ModelCard:
    """Everything the UI needs to describe the model truthfully."""

    algorithm: str
    target: str
    feature_count: int
    training_samples: int
    testing_samples: int
    n_estimators: int | None
    metadata: dict[str, Any]
    evaluation: list[dict[str, Any]]
    feature_columns: list[str]
    temporal_sensitivity: dict[str, Any] = field(default_factory=dict)
    limitations: list[str] = field(default_factory=list)


class ModelService:
    def __init__(self) -> None:
        settings = get_settings()
        self._settings = settings
        self.feature_columns: list[str] = json.loads(
            settings.feature_columns_path.read_text(encoding="utf-8")
        )
        self.metadata: dict[str, Any] = json.loads(
            settings.model_metadata_path.read_text(encoding="utf-8")
        )
        self.evaluation = self._read_evaluation()
        log.info("Loading model from %s", settings.model_path)
        self.model = joblib.load(settings.model_path)
        self._estimators = self._extract_estimators()
        self.card: ModelCard | None = None

    # ------------------------------------------------------------------ load

    def _read_evaluation(self) -> list[dict[str, Any]]:
        path = self._settings.model_evaluation_path
        if not path.exists():
            return []
        rows: list[dict[str, Any]] = []
        with path.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                parsed: dict[str, Any] = {"model": row.get("model", "")}
                for key in ("MAE", "RMSE", "R2"):
                    try:
                        parsed[key] = float(row[key])
                    except (KeyError, TypeError, ValueError):
                        parsed[key] = None
                rows.append(parsed)
        return rows

    def _extract_estimators(self) -> list[Any]:
        """Return the individual trees, unwrapping a Pipeline if present."""
        estimator = self.model
        if hasattr(estimator, "steps"):  # sklearn Pipeline
            estimator = estimator.steps[-1][1]
        return list(getattr(estimator, "estimators_", []))

    # ------------------------------------------------------------- inference

    def build_matrix(
        self, static_rows: list[dict[str, float]], context: dict[str, float]
    ) -> pd.DataFrame:
        """Assemble the model input in the exact trained column order.

        Returned as a named DataFrame because the estimator was fitted with
        feature names; passing a bare array works but raises a warning on every
        call and loses the column-order safety check.

        Real context values are passed through even for features the model is
        currently insensitive to, so a future retrain on varied data works with
        no change here.
        """
        merged = {**REFERENCE_CONTEXT, **context}
        columns: dict[str, np.ndarray] = {}
        for column in self.feature_columns:
            if column in CONTEXT_FEATURES:
                columns[column] = np.full(len(static_rows), merged[column], dtype=np.float64)
            else:
                columns[column] = np.fromiter(
                    (float(row.get(column, 0.0)) for row in static_rows),
                    dtype=np.float64,
                    count=len(static_rows),
                )
        return pd.DataFrame(columns, columns=self.feature_columns)

    def predict(self, matrix: pd.DataFrame) -> np.ndarray:
        return np.asarray(self.model.predict(matrix), dtype=np.float64)

    def predict_with_dispersion(self, matrix: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        """Predict and report per-tree standard deviation.

        The spread across the forest's trees measures internal model
        disagreement. It is not a calibrated confidence interval. On the shipped
        model it comes out at exactly zero, because the prototype target is a
        deterministic function of one input feature and every tree therefore
        learns the same mapping - see `dispersion_is_degenerate`.
        """
        mean = self.predict(matrix)
        if not self._estimators:
            return mean, np.zeros_like(mean)
        # Trees expect the same named columns as the fitted estimator.
        per_tree = np.stack([tree.predict(matrix.to_numpy()) for tree in self._estimators])
        return mean, per_tree.std(axis=0)

    # ------------------------------------------------------------ self-audit

    def probe_temporal_sensitivity(self, static_rows: list[dict[str, float]]) -> dict[str, Any]:
        """Measure whether predictions move with hour / weekday / rainfall.

        Returns the largest observed deviation from the reference prediction
        across a 24-hour sweep and a wet-weather case.
        """
        sample = static_rows[: min(256, len(static_rows))]
        if not sample:
            return {"probed": False}

        reference = self.predict(self.build_matrix(sample, {}))
        max_hour_delta = 0.0
        for hour in range(24):
            for day in (1, 5, 6):
                preds = self.predict(
                    self.build_matrix(sample, {"hour": float(hour), "day_of_week": float(day)})
                )
                max_hour_delta = max(max_hour_delta, float(np.max(np.abs(preds - reference))))

        wet = self.predict(
            self.build_matrix(
                sample,
                {"precipitation_mm": 18.0, "rain_mm": 18.0, "cloud_cover_pct": 100.0},
            )
        )
        max_weather_delta = float(np.max(np.abs(wet - reference)))

        responds = max_hour_delta > 0.01 or max_weather_delta > 0.01
        return {
            "probed": True,
            "sample_size": len(sample),
            "max_delta_kmh_across_hours": round(max_hour_delta, 6),
            "max_delta_kmh_wet_weather": round(max_weather_delta, 6),
            "model_responds_to_time_or_weather": responds,
            "note": (
                "Measured at service start by re-scoring the same road segments across all "
                "24 hours, three weekdays and a heavy-rain case."
                if responds
                else "Measured at service start: the model output does not change with time "
                "or weather, because every training row carried hour=8 and day_of_week=1. "
                "Time-of-day effects in Smart Road come from the separate rule-based "
                "congestion profile, never from this model."
            ),
        }

    def build_card(self, static_rows: list[dict[str, float]]) -> ModelCard:
        sensitivity = self.probe_temporal_sensitivity(static_rows)
        limitations = [
            "Traffic labels are prototype data, not observed traffic counts.",
            "Training data covers a single time slice (08:00, weekday index 1), so the "
            "model carries no learned time-of-day or weather signal.",
            "The reported R2 of 1.0 reflects a deterministic label in the prototype "
            "dataset, not real-world predictive accuracy.",
            "Dispersion across forest trees is reported as a spread measure, not a "
            "calibrated confidence interval.",
        ]
        self.card = ModelCard(
            algorithm=str(self.metadata.get("model", type(self.model).__name__)),
            target=str(self.metadata.get("target", "traffic_speed_kmh")),
            feature_count=len(self.feature_columns),
            training_samples=int(self.metadata.get("training_samples", 0)),
            testing_samples=int(self.metadata.get("testing_samples", 0)),
            n_estimators=len(self._estimators) or None,
            metadata=self.metadata,
            evaluation=self.evaluation,
            feature_columns=self.feature_columns,
            temporal_sensitivity=sensitivity,
            limitations=limitations,
        )
        return self.card
