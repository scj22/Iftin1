"""Runtime configuration for the Smart Road AI service."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# ai-service/app/core/config.py -> ai-service/app/core -> app -> ai-service -> repo root
REPO_ROOT = Path(__file__).resolve().parents[3]


def _first_existing(*candidates: Path) -> Path:
    """Return the first path that exists, else the first candidate.

    The ML assets were produced in Colab and may sit either at the repo root or
    inside backend/. Resolving both keeps the service working without moving
    files that other tooling may already reference.
    """
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SMARTROAD_", env_file=".env", extra="ignore")

    city: str = "Mogadishu"
    region: str = "Banaadir"
    country: str = "Somalia"

    models_dir: Path = _first_existing(
        REPO_ROOT / "smart_road_models",
        REPO_ROOT / "backend" / "smart_road_models",
    )
    data_dir: Path = _first_existing(
        REPO_ROOT / "smart_road_data",
        REPO_ROOT / "backend" / "smart_road_data",
    )

    # Bound how much of the network a single request may explore.
    max_route_distance_km: float = 60.0
    alternative_count: int = 2
    # An alternative sharing more than this fraction of length with the
    # recommended route is discarded as a near-duplicate.
    max_route_overlap: float = 0.75

    host: str = "127.0.0.1"
    port: int = 8000

    @property
    def model_path(self) -> Path:
        return self.models_dir / "traffic_prediction_model.joblib"

    @property
    def feature_columns_path(self) -> Path:
        return self.models_dir / "feature_columns.json"

    @property
    def model_metadata_path(self) -> Path:
        return self.models_dir / "model_metadata.json"

    @property
    def model_evaluation_path(self) -> Path:
        return self.models_dir / "model_evaluation.csv"

    @property
    def network_csv_path(self) -> Path:
        return self.data_dir / "processed" / "smart_road_final_ml_dataset.csv"

    @property
    def weather_csv_path(self) -> Path:
        return self.data_dir / "weather" / "mogadishu_weather_clean.csv"


@lru_cache
def get_settings() -> Settings:
    return Settings()
