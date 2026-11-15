import json
import logging
from time import perf_counter
from typing import Dict, Any, Literal, Optional
from openai import OpenAI
from pydantic import BaseModel, Field, model_validator

from app.config import (
    OLLAMA_BASE_URL,
    VISION_MODEL,
    VISION_API_KEY,
    USE_FALLBACK_MOCK,
    BOUNDING_BOX,
    FALLBACK_DAMAGE_FILE,
)

logger = logging.getLogger(__name__)

class DetectedHazard(BaseModel):
    title: str = Field(description="Name or short descriptor of the hazard")
    hazard_type: str = Field(description="E.g., RIVER_OVERTOPPING, BRIDGE_WASHOUT, LANDSLIDE, STRUCTURAL_COLLAPSE")
    severity: Literal["CRITICAL", "HIGH", "MODERATE"]
    water_depth_est_m: Optional[float] = Field(ge=0, description="Depth in meters only if supported by evidence, otherwise null")
    impact_description: str = Field(description="Impact on transit and evacuation corridors")
    # Normalized bounding box in image coordinates (0.0 to 1.0)
    # top-left (min_x, min_y) to bottom-right (max_x, max_y)
    min_x: float = Field(ge=0.0, le=1.0)
    min_y: float = Field(ge=0.0, le=1.0)
    max_x: float = Field(ge=0.0, le=1.0)
    max_y: float = Field(ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_box_order(self):
        if self.min_x >= self.max_x or self.min_y >= self.max_y:
            raise ValueError("Bounding boxes must have min_x < max_x and min_y < max_y")
        return self

class VisionAnalysisResult(BaseModel):
    summary: str
    hazards: list[DetectedHazard]

def load_fallback_damage_data() -> Dict[str, Any]:
    """Reads the pre-computed golden GeoJSON fallback file."""
    if FALLBACK_DAMAGE_FILE.exists():
        with open(FALLBACK_DAMAGE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            data["metadata"]["source"] = "FALLBACK_GOLDEN_CACHE"
            return data
    return {
        "type": "FeatureCollection",
        "metadata": {"source": "EMPTY_FALLBACK", "status": "NO_DATA"},
        "features": []
    }

def normalize_box_to_geojson_polygon(hazard: DetectedHazard, bbox: dict) -> list[list[list[float]]]:
    """
    Transforms normalized image coordinates (0.0 to 1.0) into GeoJSON [longitude, latitude] coordinates.
    Note:
      - X ratio 0.0 -> minLon, 1.0 -> maxLon
      - Y ratio 0.0 (top of image) -> maxLat (North), 1.0 (bottom of image) -> minLat (South)
    GeoJSON polygons require [lon, lat] and must be closed (first coordinate equals last).
    """
    min_lon = bbox["minLon"]
    max_lon = bbox["maxLon"]
    min_lat = bbox["minLat"]
    max_lat = bbox["maxLat"]

    lon_span = max_lon - min_lon
    lat_span = max_lat - min_lat

    poly_min_lon = round(min_lon + (hazard.min_x * lon_span), 6)
    poly_max_lon = round(min_lon + (hazard.max_x * lon_span), 6)
    poly_max_lat = round(max_lat - (hazard.min_y * lat_span), 6)
    poly_min_lat = round(max_lat - (hazard.max_y * lat_span), 6)

    # Counter-clockwise closed ring in [lon, lat]
    return [[
        [poly_min_lon, poly_max_lat],
        [poly_min_lon, poly_min_lat],
        [poly_max_lon, poly_min_lat],
        [poly_max_lon, poly_max_lat],
        [poly_min_lon, poly_max_lat]
    ]]

def analyze_disaster_imagery(
    before_image_url: Optional[str] = None,
    after_image_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Analyzes before/after disaster imagery using local Qwen3-VL (qwen3-vl:4b via Ollama),
    or falls back immediately to golden cached GeoJSON data.
    """
    if USE_FALLBACK_MOCK:
        logger.info("USE_FALLBACK_MOCK=true. Serving cached golden fallback damage data.")
        return load_fallback_damage_data()

    if not after_image_url:
        logger.info("No post-disaster image provided. Serving golden fallback.")
        return load_fallback_damage_data()

    try:
        # Connect to local Ollama OpenAI-compatible server (default: http://localhost:11434/v1)
        client = OpenAI(
            base_url=OLLAMA_BASE_URL,
            api_key=VISION_API_KEY,
            timeout=240.0,
            max_retries=0,
        )

        messages = [
            {
                "role": "system",
                "content": (
                    "You analyze aligned, north-up optical satellite images of Kuala Lumpur. "
                    "When BEFORE is supplied, compare it with AFTER and detect only new visible flooding "
                    "outside normal river banks or visible structural damage in AFTER. "
                    "Use tight bounding boxes around each connected affected area. Do not label normal rivers, "
                    "shadows, or undamaged buildings as hazards. Return hazards=[] if no change is visible. "
                    "Coordinates refer ONLY to the full AFTER image, excluding no margins: "
                    "origin (0,0) is top-left, (1,1) is bottom-right, x increases right and y increases down. "
                    "Return decimal ratios, never pixels, percentages, longitude/latitude, or 0-1000 values. "
                    "Divide pixel x by image width and pixel y by image height. "
                    "Require 0 <= min_x < max_x <= 1 and 0 <= min_y < max_y <= 1. "
                    "For example, a box covering the middle quarter of an image has min_x=0.375, "
                    "min_y=0.375, max_x=0.625, max_y=0.625. "
                    "Do not invent named bridges, confirmed road closures, water depths or SAR measurements. "
                    "Set water_depth_est_m=null unless depth evidence is provided. Describe visible impacts "
                    "as suspected and requiring field verification. Return only JSON matching this schema: "
                    + json.dumps(VisionAnalysisResult.model_json_schema())
                )
            }
        ]

        user_content: list[Dict[str, Any]] = []
        if before_image_url:
            user_content.extend([
                {"type": "text", "text": "BEFORE: baseline image."},
                {"type": "image_url", "image_url": {"url": before_image_url}},
            ])
        user_content.extend([
            {"type": "text", "text": "AFTER: locate visible new floodwater or damage in this image."},
            {"type": "image_url", "image_url": {"url": after_image_url}},
        ])

        messages.append({"role": "user", "content": user_content})

        started = perf_counter()
        response = client.beta.chat.completions.parse(
            model=VISION_MODEL,
            messages=messages,
            response_format=VisionAnalysisResult,
            temperature=0,
            reasoning_effort="none",
            max_tokens=4096,
        )

        parsed: VisionAnalysisResult = response.choices[0].message.parsed
        features = []

        for idx, hazard in enumerate(parsed.hazards):
            coords = normalize_box_to_geojson_polygon(hazard, BOUNDING_BOX)
            color = "#FF0055" if hazard.severity == "CRITICAL" else "#FF2A6D"

            features.append({
                "type": "Feature",
                "id": f"ai-hazard-{idx + 1}",
                "properties": {
                    "title": hazard.title,
                    "type": hazard.hazard_type,
                    "severity": hazard.severity,
                    "waterDepthEstM": hazard.water_depth_est_m,
                    "infrastructureImpact": hazard.impact_description,
                    "bboxNormalized": [hazard.min_x, hazard.min_y, hazard.max_x, hazard.max_y],
                    "color": color
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": coords
                }
            })

        return {
            "type": "FeatureCollection",
            "metadata": {
                "source": f"QWEN3_VL_LIVE_PIPELINE ({VISION_MODEL})",
                "summary": parsed.summary,
                "hazardCount": len(features),
                "inferenceSeconds": round(perf_counter() - started, 3),
                "boundingBox": BOUNDING_BOX
            },
            "features": features
        }

    except Exception as e:
        logger.error(f"Qwen3-VL ({VISION_MODEL}) analysis failed: {e}. Falling back to golden cache.")
        fallback = load_fallback_damage_data()
        fallback["metadata"]["warning"] = f"Live Qwen3-VL scan failed ({str(e)}). Golden fallback served."
        return fallback
