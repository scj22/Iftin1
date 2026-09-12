"""Place search for Mogadishu.

Primary source is OpenStreetMap Nominatim (free, no billing, no API key),
restricted to the network's own bounding box. When the host has no outbound
network access, a built-in gazetteer of well-known Mogadishu landmarks is used
instead.

Gazetteer coordinates are approximate landmark centroids. Every result - from
either source - is snapped to the nearest routable node and reports how far it
moved, so the user always sees where routing will actually begin.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.services.graph_service import RoadNetwork, haversine_m

log = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim's usage policy requires an identifying User-Agent.
USER_AGENT = "SmartRoad/1.0 (Mogadishu routing prototype)"


@dataclass(frozen=True)
class Place:
    name: str
    lon: float
    lat: float
    category: str
    district: str = ""


# Approximate centroids for landmarks widely used as navigation references in
# Mogadishu. Treated as convenience anchors, not survey-grade coordinates.
GAZETTEER: tuple[Place, ...] = (
    Place("Aden Adde International Airport", 45.3047, 2.0144, "transport", "Wadajir"),
    Place("Port of Mogadishu", 45.3444, 2.0208, "transport", "Hamarweyne"),
    Place("Bakara Market", 45.3269, 2.0469, "market", "Hodan"),
    Place("Villa Somalia", 45.3378, 2.0389, "government", "Shangani"),
    Place("KM4 Junction", 45.3197, 2.0397, "junction", "Hodan"),
    Place("KM5 Junction", 45.3128, 2.0428, "junction", "Hodan"),
    Place("Lido Beach", 45.3389, 2.0500, "leisure", "Abdiaziz"),
    Place("Banadir Hospital", 45.3242, 2.0344, "health", "Wadajir"),
    Place("De Martino Hospital", 45.3333, 2.0333, "health", "Hamarweyne"),
    Place("Digfer Hospital", 45.3200, 2.0480, "health", "Hodan"),
    Place("Erdogan Hospital", 45.3050, 2.0250, "health", "Wadajir"),
    Place("SIMAD University", 45.3125, 2.0431, "education", "Hodan"),
    Place("Mogadishu University", 45.3300, 2.0550, "education", "Warta Nabada"),
    Place("Somali National University", 45.3180, 2.0420, "education", "Hodan"),
    Place("Mogadishu Stadium", 45.3230, 2.0530, "leisure", "Wardhiigleey"),
    Place("Hamarweyne Old Town", 45.3400, 2.0250, "district", "Hamarweyne"),
    Place("Shangani", 45.3420, 2.0330, "district", "Shangani"),
    Place("Hodan District", 45.3150, 2.0450, "district", "Hodan"),
    Place("Wadajir District", 45.2950, 2.0100, "district", "Wadajir"),
    Place("Dharkenley District", 45.2800, 2.0250, "district", "Dharkenley"),
    Place("Warta Nabada District", 45.3400, 2.0650, "district", "Warta Nabada"),
    Place("Yaaqshiid District", 45.3350, 2.0650, "district", "Yaaqshiid"),
    Place("Kaaraan District", 45.3450, 2.0750, "district", "Kaaraan"),
    Place("Shibis District", 45.3450, 2.0450, "district", "Shibis"),
    Place("Abdiaziz District", 45.3400, 2.0400, "district", "Abdiaziz"),
    Place("Daynile District", 45.2700, 2.0700, "district", "Daynile"),
    Place("Elasha Biyaha", 45.2500, 1.9850, "district", "Wadajir"),
    Place("Maka Al Mukarama Road", 45.3250, 2.0420, "road", "Hodan"),
    Place("Warshadaha Road", 45.3300, 2.0600, "road", "Yaaqshiid"),
    Place("Jidka Sodonka", 45.3050, 2.0350, "road", "Hodan"),
)

CATEGORY_LABELS = {
    "transport": "Transport hub",
    "market": "Market",
    "government": "Government",
    "junction": "Junction",
    "leisure": "Leisure",
    "health": "Hospital",
    "education": "Education",
    "district": "District",
    "road": "Major road",
    "osm": "OpenStreetMap result",
}


class PlacesService:
    def __init__(self, network: RoadNetwork) -> None:
        self.network = network
        self._nominatim_available: bool | None = None
        self._entries = [self._snap(place) for place in GAZETTEER]
        self._entries = [entry for entry in self._entries if entry is not None]

    # ------------------------------------------------------------- snapping

    def _snap(self, place: Place) -> dict[str, Any] | None:
        bounds = self.network.stats["bounds"]
        if not (bounds["min_lon"] <= place.lon <= bounds["max_lon"]):
            log.warning("Gazetteer entry %s falls outside the network; dropped", place.name)
            return None
        if not (bounds["min_lat"] <= place.lat <= bounds["max_lat"]):
            log.warning("Gazetteer entry %s falls outside the network; dropped", place.name)
            return None
        nearest = self.network.nearest_node(place.lon, place.lat)
        return {
            "id": f"gz-{place.name.lower().replace(' ', '-')}",
            "name": place.name,
            "district": place.district,
            "category": place.category,
            "category_label": CATEGORY_LABELS.get(place.category, "Place"),
            "lon": round(nearest.lon, 6),
            "lat": round(nearest.lat, 6),
            "reference_lon": place.lon,
            "reference_lat": place.lat,
            "snap_offset_m": round(nearest.distance_m, 1),
            "source": "built-in-gazetteer",
            "precision": "approximate landmark centroid, snapped to the road network",
        }

    def snap_coordinate(self, lon: float, lat: float) -> dict[str, Any]:
        nearest = self.network.nearest_node(lon, lat)
        return {
            "lon": round(nearest.lon, 6),
            "lat": round(nearest.lat, 6),
            "requested_lon": lon,
            "requested_lat": lat,
            "snap_offset_m": round(nearest.distance_m, 1),
            "in_coverage": nearest.distance_m <= 400,
            "nearest_place": self.nearest_place(nearest.lon, nearest.lat),
        }

    def nearest_place(self, lon: float, lat: float) -> dict[str, Any] | None:
        """Closest gazetteer landmark, used to give a coordinate a human name."""
        if not self._entries:
            return None
        best = min(
            self._entries,
            key=lambda entry: haversine_m(lon, lat, entry["lon"], entry["lat"]),
        )
        distance = haversine_m(lon, lat, best["lon"], best["lat"])
        return {
            "name": best["name"],
            "district": best["district"],
            "distance_m": round(distance, 0),
        }

    # --------------------------------------------------------------- search

    def search_local(self, query: str, limit: int = 8) -> list[dict[str, Any]]:
        needle = query.strip().lower()
        if not needle:
            return []
        scored: list[tuple[int, dict[str, Any]]] = []
        for entry in self._entries:
            haystack = f"{entry['name']} {entry['district']} {entry['category']}".lower()
            if haystack.startswith(needle):
                scored.append((0, entry))
            elif entry["name"].lower().startswith(needle):
                scored.append((1, entry))
            elif needle in haystack:
                scored.append((2, entry))
        scored.sort(key=lambda item: (item[0], item[1]["name"]))
        return [entry for _, entry in scored[:limit]]

    async def search_nominatim(self, query: str, limit: int = 6) -> list[dict[str, Any]]:
        bounds = self.network.stats["bounds"]
        params = {
            "q": query,
            "format": "jsonv2",
            "limit": limit,
            "countrycodes": "so",
            "viewbox": (
                f"{bounds['min_lon']},{bounds['max_lat']},{bounds['max_lon']},{bounds['min_lat']}"
            ),
            "bounded": 1,
        }
        try:
            async with httpx.AsyncClient(
                timeout=6.0, headers={"User-Agent": USER_AGENT}
            ) as client:
                response = await client.get(NOMINATIM_URL, params=params)
                response.raise_for_status()
                payload = response.json()
        except Exception as exc:
            log.info("Nominatim unavailable (%s); using built-in gazetteer only", exc)
            self._nominatim_available = False
            return []

        self._nominatim_available = True
        results: list[dict[str, Any]] = []
        for item in payload:
            try:
                lon, lat = float(item["lon"]), float(item["lat"])
            except (KeyError, TypeError, ValueError):
                continue
            nearest = self.network.nearest_node(lon, lat)
            display = str(item.get("display_name", ""))
            results.append(
                {
                    "id": f"osm-{item.get('osm_type', 'n')}-{item.get('osm_id', '')}",
                    "name": display.split(",")[0].strip() or display,
                    "district": ", ".join(display.split(",")[1:3]).strip(),
                    "category": "osm",
                    "category_label": str(item.get("type", "Place")).replace("_", " ").title(),
                    "lon": round(nearest.lon, 6),
                    "lat": round(nearest.lat, 6),
                    "reference_lon": lon,
                    "reference_lat": lat,
                    "snap_offset_m": round(nearest.distance_m, 1),
                    "source": "openstreetmap-nominatim",
                    "precision": "OpenStreetMap geocoding result, snapped to the road network",
                }
            )
        return results

    async def search(self, query: str, limit: int = 8, allow_remote: bool = True) -> dict[str, Any]:
        local = self.search_local(query, limit)
        remote: list[dict[str, Any]] = []
        if allow_remote and len(query.strip()) >= 3:
            remote = await self.search_nominatim(query, limit)

        seen: set[tuple[float, float]] = set()
        merged: list[dict[str, Any]] = []
        for entry in local + remote:
            key = (round(entry["lon"], 5), round(entry["lat"], 5))
            if key in seen:
                continue
            seen.add(key)
            merged.append(entry)

        return {
            "query": query,
            "results": merged[:limit],
            "sources": {
                "built_in_gazetteer": {"available": True, "entries": len(self._entries)},
                "openstreetmap_nominatim": {
                    "available": self._nominatim_available,
                    "checked": allow_remote and len(query.strip()) >= 3,
                },
            },
        }

    def all_places(self) -> list[dict[str, Any]]:
        return sorted(self._entries, key=lambda entry: entry["name"])
