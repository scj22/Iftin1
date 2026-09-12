# Smart Road

**Smarter roads. Faster journeys.**

An AI-assisted road and traffic platform for Mogadishu, Banaadir. Smart Road routes over a real
OpenStreetMap extract of the city, predicts how fast each corridor will actually move, compares
genuine alternatives, and explains its recommendation with the numbers behind it.

---

## What it does

- **Real routing.** A\* over 32,775 road segments (2,299 km, 20,714 junctions) from the prepared
  OSM extract. No invented geometry.
- **Predicted speeds.** The trained `traffic_prediction_model.joblib` scores every segment; a
  published rule-based profile then applies time-of-day, road-class, corridor-density and weather
  effects.
- **Genuine alternatives.** Found by penalising the chosen corridor and re-searching. Candidates
  overlapping the recommendation by more than 75% are discarded rather than padded out.
- **Explained recommendations.** Every claim in the explanation is derived from a number the
  routing pass computed, with a provenance breakdown of which component produced which value.
- **Traffic intelligence.** Whole-network congestion for any hour of any day, hotspot detection,
  and a viewport-bounded congestion map.
- **Accounts and history.** JWT auth with refresh cookies; saved routes keep the prediction context
  they were computed under.

---

## Honest limitations

These are stated in the product itself, not only here.

| Claim | Reality |
| --- | --- |
| Traffic data | **Prototype predictions, not live observations.** Labelled throughout the UI. |
| Model R² = 1.0 | The prototype target is a deterministic multiple of `base_speed_kmh`. A perfect score means the model reproduced a formula, **not** that it predicts real traffic. |
| Time-of-day intelligence | The shipped model learned **none**. Every training row carried `hour=8, day_of_week=1`. The service measures this at start-up and reports it. Time effects come from the separate rule-based profile. |
| Prediction certainty | Per-tree dispersion is exactly zero on this model, so certainty is reported as **"Not measurable"** rather than as high confidence, and is excluded from route scoring. |
| One-way streets | The prepared network has no one-way attribute. All segments are treated as bidirectional. Turn restrictions are not modelled. |
| Email delivery | Not configured. Password reset generates a real single-use token; outside production it is returned in the response so the flow can be completed. |

The `/app/insights` page renders all of this live from the running service.

---

## Architecture

```
                 React + Vite + Tailwind + React Leaflet
                                │  REST (browser talks only to Express)
                                ▼
                    Node.js + Express  ── MongoDB (users, route history)
                                │
                                ▼  HTTP
                    Python + FastAPI + Uvicorn
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
   traffic_prediction    NetworkX graph    Congestion profile
     _model.joblib       + A* routing       (rule-based, published)
```

```
SMART ROAD/
├── ai-service/            FastAPI — model, routing, traffic, places
│   ├── app/
│   │   ├── core/config.py           Path + settings resolution
│   │   ├── services/
│   │   │   ├── model_service.py     Loads the joblib; self-audits the model
│   │   │   ├── graph_service.py     Builds the routable network, scores it
│   │   │   ├── routing_service.py   A* + alternatives + composite scoring
│   │   │   ├── congestion.py        The rule-based profile (not ML)
│   │   │   ├── explanation.py       Generates the "why" from real numbers
│   │   │   ├── traffic_service.py   City-wide snapshot + hotspots
│   │   │   ├── weather_service.py   Open-Meteo live, prepared normals fallback
│   │   │   └── places_service.py    Nominatim + built-in gazetteer
│   │   └── routers/
│   └── tests/test_core.py           21 invariant tests
├── backend/               Express — auth, history, orchestration
│   ├── src/
│   ├── smart_road_models/           The Colab artefacts (unchanged)
│   └── smart_road_data/             Prepared datasets (unchanged)
└── frontend/              React — the application
```

---

## Running it

Requires **Node 20+**, **Python 3.12+**, and **MongoDB** (optional — see below).

### 1. AI service

```bash
cd ai-service
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Linux/macOS: .venv/bin/python
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

First start takes ~15 s: it loads the model, scores all 32,775 segments, builds the graph and runs
the temporal self-audit. Interactive API docs at <http://127.0.0.1:8000/docs>.

### 2. Backend

```bash
cd backend
npm install
npm run dev
```

Runs on port 4000. Copy `.env.example` to `.env` to configure; nothing is required for local
development — JWT secrets are generated per boot when unset.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to the backend.

### Or start everything at once

```bash
./start.sh          # macOS / Linux / Git Bash
./start.ps1         # Windows PowerShell
```

### Optional: seed a demo account

```bash
cd backend
npm run seed
```

Creates `demo@smartroad.so` / `SmartRoad2026` with five saved routes. The history is **not
fabricated** — each entry is planned by calling the running AI service, so every figure stored is a
genuine result. Local demonstration only; do not deploy this account.

---

## Graceful degradation

Smart Road never shows a control that cannot work.

| Service down | Behaviour |
| --- | --- |
| MongoDB | Navigation and traffic keep working. Accounts and saved history return 503 with a clear message; the UI hides the affected controls and shows a banner. |
| AI service | Routing and traffic predictions are unavailable and the app says so, with the command to start the service. No stale numbers are shown. |
| Open-Meteo | Falls back to month-and-hour normals computed from the prepared 2025 weather dataset. The active source is always named in the UI. |
| Nominatim | Falls back to the built-in Mogadishu gazetteer. The place picker labels each result's source. |

`GET /api/health` reports exactly which of these is true.

---

## Design notes

**Somalia-first.** The congestion profile follows the Somali week: Friday is the rest day carrying a
midday Jumca movement rather than commuter peaks; the working week runs Saturday through Thursday.
Rain penalties are weighted by surface quality because unpaved sections flood during the Gu and Deyr
rains.

**No paid dependencies.** OpenStreetMap raster tiles, Nominatim geocoding and Open-Meteo weather —
all free, no API key, no billing. Dark mode filters the OSM raster rather than requiring a paid dark
tile provider.

**Free-flow derivation.** The model was trained on a congested slice (weekday 08:00), so its raw
output already contains that slice's congestion. Smart Road divides it by the profile's own
retention at the same slice to recover a free-flow reference. This guarantees that re-scoring at
weekday 08:00 reproduces the model's output exactly — verified to 1e-9 in the test suite.

**Corridor exposure.** Congestion concentrates in the city core. Rather than assert where, Smart
Road measures it from the network: the density of trunk/primary/secondary road length within 500 m
of each segment, scaled to [0, 1]. It only applies during peaks.

---

## Tests

```bash
cd ai-service
.venv/Scripts/python -m pytest tests -q
```

21 tests covering the invariants the product's correctness and honesty depend on: scalar/vector
profile agreement, reference-slice reproduction, route geometry continuity, alternatives being
genuinely distinct, peak hours being slower than nights, rain slowing journeys, degenerate scoring
terms being dropped, and the explanation never crediting a term it did not use.

---

## Data and attribution

- Road network: OpenStreetMap contributors, extracted during the Smart Road data phase
  ([ODbL](https://www.openstreetmap.org/copyright))
- Basemap tiles: OpenStreetMap
- Geocoding: OpenStreetMap Nominatim
- Weather: [Open-Meteo](https://open-meteo.com/)
- Traffic labels: prototype data generated during the Colab phase — **not observed traffic**
