"""Run with backend/venv/bin/python pitch/capture_scan.py while FastAPI and Ollama run."""
import base64
import json
from pathlib import Path
from time import perf_counter

import httpx

PITCH = Path(__file__).resolve().parent


def image_url(filename, mime):
    encoded = base64.b64encode((PITCH / "assets" / filename).read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


with httpx.Client(base_url="http://localhost:8000", timeout=250, trust_env=False) as client:
    docs = client.get("/docs")
    docs.raise_for_status()
    assert "swagger-ui" in docs.text
    mock_started = perf_counter()
    mock = client.post("/api/analyze-disaster", json={"force_mock": True})
    mock.raise_for_status()
    mock_seconds = perf_counter() - mock_started
    assert mock.json()["metadata"]["source"] == "FALLBACK_GOLDEN_CACHE"

    started = perf_counter()
    response = client.post("/api/analyze-disaster", json={
        "before_image_url": image_url("kl-before.jpg", "image/jpeg"),
        "after_image_url": image_url("kl-after-synthetic.png", "image/png"),
    })
    response.raise_for_status()
    elapsed = perf_counter() - started
    result = response.json()
    # A 200 response can be a fallback. Never promote it as a successful inference.
    assert result["metadata"]["source"].startswith("QWEN3_VL_LIVE_PIPELINE"), result["metadata"]
    assert result["type"] == "FeatureCollection" and result["features"], "No hazards detected"
    bbox = result["metadata"]["boundingBox"]
    for feature in result["features"]:
        assert feature["geometry"]["type"] == "Polygon"
        ring = feature["geometry"]["coordinates"][0]
        assert len(ring) == 5 and ring[0] == ring[-1]
        for lon, lat in ring:
            assert bbox["minLon"] <= lon <= bbox["maxLon"]
            assert bbox["minLat"] <= lat <= bbox["maxLat"]
        min_x, min_y, max_x, max_y = feature["properties"]["bboxNormalized"]
        assert 0 <= min_x < max_x <= 1 and 0 <= min_y < max_y <= 1

    evidence = PITCH / "evidence"
    evidence.mkdir(exist_ok=True)
    (evidence / "live-scan.geojson").write_text(response.text + "\n", encoding="utf-8")
    timings = {"liveRequestSeconds": round(elapsed, 3),
               "mockRequestSeconds": round(mock_seconds, 3),
               "hazardCount": len(result["features"]), "syntheticAfterImage": True}
    (evidence / "timings.json").write_text(json.dumps(timings, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(timings, indent=2))
    print("Candidate saved to pitch/evidence/live-scan.geojson. Review its map overlay before promotion.")
