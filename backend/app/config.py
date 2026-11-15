import json
import os
from pathlib import Path
from dotenv import load_dotenv

# Base paths
BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent
SHARED_DIR = PROJECT_ROOT / "shared"
CONFIG_FILE = SHARED_DIR / "config.json"
FALLBACK_DAMAGE_FILE = SHARED_DIR / "fallback_damage.json"
FALLBACK_SAFE_FILE = SHARED_DIR / "fallback_safe_zones.json"
FALLBACK_ROUTE_FILE = SHARED_DIR / "fallback_route.json"

# Load backend .env if present
load_dotenv(BACKEND_DIR / ".env")

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
VISION_MODEL = os.getenv("VISION_MODEL", "qwen3-vl:4b")
VISION_API_KEY = os.getenv("VISION_API_KEY", "ollama")
USE_FALLBACK_MOCK = os.getenv("USE_FALLBACK_MOCK", "false").lower() in ("true", "1", "yes")

# Load shared config
def load_shared_config():
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

SHARED_CONFIG = load_shared_config()
BOUNDING_BOX = SHARED_CONFIG.get("spatial", {}).get("boundingBox", {
    "minLon": 101.6600,
    "minLat": 3.1100,
    "maxLon": 101.7300,
    "maxLat": 3.1700
})
