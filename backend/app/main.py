from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import disaster
from app.config import SHARED_CONFIG

app = FastAPI(
    title="Project Aegis - Tactical Disaster Recovery API",
    description="Backend microservice for AI damage detection and spatial hazard routing",
    version="1.0.0"
)

# Enable CORS for local Vite dev server and external pitch machines
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(disaster.router)

@app.get("/api/health")
def health_check():
    return {
        "status": "OPERATIONAL",
        "system": "Aegis Tactical Backend",
        "mission": SHARED_CONFIG.get("mission", {}).get("name", "Project Aegis")
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
