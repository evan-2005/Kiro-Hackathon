import json
import logging
from typing import Dict, Any, Optional
from openai import OpenAI
from pydantic import BaseModel, Field

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
    severity: str = Field(description="CRITICAL, HIGH, or MODERATE")
    water_depth_est_m: float = Field(description="Estimated water depth in meters")
    impact_description: str = Field(description="Impact on transit and evacuation corridors")
    # Normalized bounding box in image coordinates (0.0 to 1.0)
    # top-left (min_x, min_y) to bottom-right (max_x, max_y)
    min_x: float = Field(ge=0.0, le=1.0)
    min_y: float = Field(ge=0.0, le=1.0)
    max_x: float = Field(ge=0.0, le=1.0)
    max_y: float = Field(ge=0.0, le=1.0)

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
        [poly_max_lon, poly_max_lat],
        [poly_max_lon, poly_min_lat],
        [poly_min_lon, poly_min_lat],
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
        )

        messages = [
            {
                "role": "system",
                "content": (
                    "You are Project Aegis's Tactical Orbital Damage Detector running on Qwen3-VL. "
                    "Analyze post-disaster aerial/satellite imagery to locate flooded corridors, "
                    "collapsed bridges, and submerged transit arteries. "
                    "Return strictly JSON matching the requested schema with normalized coordinates [0.0 - 1.0] "
                    "where min_x, min_y is top-left and max_x, max_y is bottom-right."
                )
            }
        ]

        user_content: list[Dict[str, Any]] = [
            {
                "type": "text",
                "text": "Detect all impassable flood hazards and structural breaches in this disaster zone."
            },
            {
                "type": "image_url",
                "image_url": {"url": after_image_url}
            }
        ]

        if before_image_url:
            user_content.insert(1, {
                "type": "image_url",
                "image_url": {"url": before_image_url}
            })

        messages.append({"role": "user", "content": user_content})

        response = client.beta.chat.completions.parse(
            model=VISION_MODEL,
            messages=messages,
            response_format=VisionAnalysisResult,
            temperature=0.1,
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
                "boundingBox": BOUNDING_BOX
            },
            "features": features
        }

    except Exception as e:
        logger.error(f"Qwen3-VL ({VISION_MODEL}) analysis failed: {e}. Falling back to golden cache.")
        fallback = load_fallback_damage_data()
        fallback["metadata"]["warning"] = f"Live Qwen3-VL scan failed ({str(e)}). Golden fallback served."
        return fallback
