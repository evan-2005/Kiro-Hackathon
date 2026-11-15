"""Run with backend/venv/bin/python pitch/benchmark_models.py. Does not alter demo config/cache."""
import base64
import hashlib
import json
import platform
import statistics
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
from openai import OpenAI

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.config import OLLAMA_BASE_URL, VISION_API_KEY
from app.services import vision_analyzer as vision


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_benchmark():
    output = ROOT / "pitch/benchmarks" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output.mkdir(parents=True)
    protected = [ROOT / "backend/.env", ROOT / "shared/fallback_damage.json"]
    original_hashes = {str(p): digest(p) for p in protected if p.exists()}
    images = [ROOT / "pitch/assets/kl-before.jpg", ROOT / "pitch/assets/kl-after-synthetic.png"]
    urls = [f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()
            for p, mime in zip(images, ["image/jpeg", "image/png"])]

    # Capture the exact production request without making an inference or editing its prompt.
    probe = MagicMock()
    probe.beta.chat.completions.parse.return_value = SimpleNamespace(choices=[SimpleNamespace(
        message=SimpleNamespace(parsed=vision.VisionAnalysisResult(summary="probe", hazards=[])))])
    with patch.object(vision, "USE_FALLBACK_MOCK", False), patch.object(vision, "OpenAI", return_value=probe):
        vision.analyze_disaster_imagery(*urls)
    request = probe.beta.chat.completions.parse.call_args.kwargs.copy()
    assert request["temperature"] == 0 and request["max_tokens"] == 4096
    assert request["reasoning_effort"] == "none" and request["response_format"] is vision.VisionAnalysisResult

    metadata = {"startedAt": datetime.now(timezone.utc).isoformat(), "platform": platform.platform(),
        "chip": subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip(),
        "memoryBytes": int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip()),
        "gitCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "models": ["qwen3-vl:4b-aegis", "qwen3-vl:4b-instruct-aegis"],
        "contextTokens": 8192, "temperature": 0, "maxOutputTokens": 4096,
        "reasoningEffort": "none", "api": "OpenAI-compatible chat.completions.parse",
        "images": [{"path": str(p.relative_to(ROOT)), "sha256": digest(p)} for p in images],
        "systemPrompt": request["messages"][0]["content"],
        "schema": vision.VisionAnalysisResult.model_json_schema(), "syntheticAfterImage": True,
        "coldDefinition": "Model unloaded immediately before first image request; disk caches not cleared",
        "warmDefinition": "Same image pair repeated with loaded model; Ollama may reuse the input cache",
        "accuracyGroundTruthAvailable": False}
    records = []
    native_url = OLLAMA_BASE_URL.rstrip("/").removesuffix("/v1")
    with httpx.Client(base_url=native_url, timeout=60, trust_env=False) as native:
        metadata["ollamaVersion"] = native.get("/api/version").json()
        metadata["initialLoadedModels"] = native.get("/api/ps").json()
        metadata["installedModels"] = native.get("/api/tags").json()
        assert any(m.get("name") == "qwen3-vl:4b-instruct" for m in metadata["installedModels"]["models"]), "Finish downloading Instruct before benchmarking"
        (output / "methodology.json").write_text(json.dumps(metadata, indent=2) + "\n")
        print(f"OUTPUT {output}", flush=True)
        for model in metadata["models"]:
            if model == "qwen3-vl:4b-instruct-aegis":
                created = native.post("/api/create", json={"model": model, "from": "qwen3-vl:4b-instruct",
                    "parameters": {"num_ctx": 8192}, "stream": False})
                created.raise_for_status()
            shown = native.post("/api/show", json={"model": model})
            shown.raise_for_status()
            details = shown.json()
            assert "8192" in details.get("parameters", ""), "Models need identical 8192-token context"
            (output / f"{model.replace(':', '-')}-model.json").write_text(json.dumps(details, indent=2) + "\n")
            unloaded = native.post("/api/generate", json={"model": model, "keep_alive": 0})
            unloaded.raise_for_status()
            assert not any(m.get("name") == model for m in native.get("/api/ps").json().get("models", []))
            for index in range(4):
                phase = "cold" if index == 0 else "warm"
                print(f"START {model} {phase} {index}", flush=True)
                record = {"model": model, "phase": phase, "run": index,
                          "startedAt": datetime.now(timezone.utc).isoformat(), "validJSON": False}
                request["model"] = model
                started = perf_counter()
                try:
                    with OpenAI(base_url=OLLAMA_BASE_URL, api_key=VISION_API_KEY,
                                timeout=240.0, max_retries=0) as client:
                        response = client.beta.chat.completions.parse(**request)
                    record["seconds"] = round(perf_counter() - started, 3)
                    parsed = response.choices[0].message.parsed
                    assert isinstance(parsed, vision.VisionAnalysisResult), "No schema-valid model result"
                    record.update(validJSON=True, finishReason=response.choices[0].finish_reason,
                        usage=response.usage.model_dump() if response.usage else None,
                        visibleResponseCharacters=len(response.choices[0].message.content or ""),
                        reasoningResponseCharacters=len((response.choices[0].message.model_extra or {}).get("reasoning_content", "") or ""),
                        result=parsed.model_dump(),
                        boxes=[[h.min_x, h.min_y, h.max_x, h.max_y] for h in parsed.hazards])
                except Exception as error:
                    record.update(seconds=round(perf_counter() - started, 3),
                                  error=f"{type(error).__name__}: {error}")
                records.append(record)
                (output / "runs.json").write_text(json.dumps(records, indent=2) + "\n")
                print(json.dumps({k:v for k,v in record.items() if k not in ["result", "usage"]}), flush=True)
            native.post("/api/generate", json={"model": model, "keep_alive": 0}).raise_for_status()

    summary = []
    for model in metadata["models"]:
        runs = [r for r in records if r["model"] == model]
        warm = [r["seconds"] for r in runs if r["phase"] == "warm" and r["validJSON"]]
        summary.append({"model": model, "validRuns": sum(r["validJSON"] for r in runs),
            "totalRuns": len(runs), "coldSeconds": runs[0]["seconds"],
            "warmMedianSeconds": round(statistics.median(warm), 3) if warm else None,
            "warmSeconds": warm, "boxes": [r.get("boxes") for r in runs]})
    assert original_hashes == {str(p): digest(p) for p in protected if p.exists()}, "Protected demo files changed"
    (output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print("SUMMARY " + json.dumps(summary), flush=True)


if __name__ == "__main__":
    run_benchmark()
