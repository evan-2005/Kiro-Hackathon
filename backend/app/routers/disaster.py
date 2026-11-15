import json
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.vision_analyzer import (
    analyze_disaster_imagery,
    load_fallback_damage_data
)
from app.config import (
    FALLBACK_SAFE_FILE,
    FALLBACK_ROUTE_FILE,
    SHARED_CONFIG
)

router = APIRouter(prefix="/api", tags=["disaster"])

class DisasterAnalysisRequest(BaseModel):
    before_image_url: Optional[str] = None
    after_image_url: Optional[str] = None
    force_mock: Optional[bool] = False

@router.get("/config")
def get_mission_config():
    """Returns the shared bounding box, map camera defaults, and mission metadata."""
    return SHARED_CONFIG

@router.post("/analyze-disaster")
def analyze_disaster(payload: DisasterAnalysisRequest = DisasterAnalysisRequest()):
    """
    Ingests satellite / aerial imagery, runs local Qwen3-VL damage detection,
    and returns GeoJSON danger zone polygons. Falls back automatically if offline.
    """
    if payload.force_mock:
        return load_fallback_damage_data()

    result = analyze_disaster_imagery(
        before_image_url=payload.before_image_url,
        after_image_url=payload.after_image_url
    )
    return result

@router.get("/safe-zones")
def get_safe_zones():
    """Returns pre-computed safe zone relief camps."""
    if FALLBACK_SAFE_FILE.exists():
        with open(FALLBACK_SAFE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    raise HTTPException(status_code=404, detail="Fallback safe zones not found")

@router.get("/evacuation-route")
def get_evacuation_route():
    """Returns pre-computed compromised and safe avoidance routes."""
    if FALLBACK_ROUTE_FILE.exists():
        with open(FALLBACK_ROUTE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    raise HTTPException(status_code=404, detail="Fallback route not found")
