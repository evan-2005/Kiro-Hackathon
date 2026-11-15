# Dev 3 vision capture

The slides are deferred. This folder holds the demo image pair and reproducible API capture.

## Captured result

The successful image-pair POST took **188.642 seconds** (model call: **188.557 seconds**). The forced-cache POST took **0.014 seconds**. See [timings.json](evidence/timings.json).

The model returned one coarse flood box: `[0.4, 0.3, 0.5, 0.7]`. Projection gives west/east `101.688 / 101.695`, south/north `3.128 / 3.152`. It overlaps the central river corridor and bridge crossings visible in the synthetic composite, while also including unaffected land. This is a coarse demo bounding box, not an accurate flood boundary or evidence of a real closure. A normalized overlay is in [projection-review.svg](evidence/projection-review.svg).

The exact response is in [live-scan.geojson](evidence/live-scan.geojson) and has been copied unchanged into `shared/fallback_damage.json`. The previous three-hazard cache is preserved in [previous-fallback-damage.json](evidence/previous-fallback-damage.json). The new cache contains **one** hazard. UI narration that hardcodes three hazards or named road closures needs a Dev 1 update.

`backend/.env` now enables fallback mode because the measured live scan exceeds the three-second demo limit. Restart Uvicorn after changing `.env`. `.env` is ignored by Git, so teammates need to copy the example and apply this flag themselves.

## Run a live scan

From the repository root, create the larger-context alias. It reuses the installed weights and keeps the original model tag intact:

```bash
ollama create qwen3-vl:4b-aegis -f backend/Modelfile
```

Set `VISION_MODEL=qwen3-vl:4b-aegis` and `USE_FALLBACK_MOCK=false` in `backend/.env`, then restart Uvicorn. Its Python reloader may not notice `.env` changes.

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

In another terminal at the repository root:

```bash
backend/venv/bin/python pitch/capture_scan.py
```

The script checks the actual `/docs` page, times a forced-cache POST, then sends both local images as base64 data URLs to `POST /api/analyze-disaster`. It only saves `evidence/live-scan.geojson` when the response explicitly reports live Qwen inference and contains valid, bounded, closed polygons. A fallback with HTTP 200 fails the capture check.

The prompt uses normalized full-image coordinates. Projection is `lon = 101.66 + x * 0.07` and `lat = 3.17 - y * 0.06`. Coordinates in GeoJSON are always `[longitude, latitude]`.

Before promoting a result into `shared/fallback_damage.json`, review its boxes over the satellite pair. Keep a copy of the old cache and copy the reviewed response exactly. Image details and attribution are in [assets/README.md](assets/README.md).

## Demo mode

If the measured scan exceeds three seconds, set `USE_FALLBACK_MOCK=true` in `backend/.env` and restart Uvicorn. Verify `metadata.source` is `FALLBACK_GOLDEN_CACHE` and time the HTTP response again. The flag is server configuration, not a per-request toggle.

The frontend's Scan button currently sends no image pair and therefore uses the cache even when live mode is enabled. Use the capture script for real inference. Image input wiring belongs to the UI integration track.

## Backend checks

```bash
cd backend
./venv/bin/python -m unittest discover -s tests -v
```

These cover north-up projection and polygon winding, invalid boxes, live serialization, model-error fallback, and API smoke checks.
