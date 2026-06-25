"""
AcademicRAG — FastAPI Application Entry Point
Serves the backend API and static frontend from port 8000.
"""
import os
import sys
from pathlib import Path

# ─── Ensure backend package is importable ──────────────────────
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn

from config import HOST, PORT
from routes.upload    import router as upload_router
from routes.documents import router as documents_router
from routes.query     import router as query_router
from routes.evaluate  import router as evaluate_router
from logger import app_logger

# ─── Create app ────────────────────────────────────────────────
app = FastAPI(
    title="AcademicRAG",
    description="Retrieval-Augmented Question Answering Comparison System",
    version="1.0.0",
)

# ─── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── API Routers ───────────────────────────────────────────────
app.include_router(upload_router,    prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(query_router,     prefix="/api")
app.include_router(evaluate_router,  prefix="/api")

# ─── Static frontend ───────────────────────────────────────────
#FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
FRONTEND_DIR = Path("C:/Users/Dell/Desktop/AcademicRAG/project/frontend")

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve frontend for all non-API routes."""
        file_path = FRONTEND_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIR / "index.html"))

else:
    @app.get("/")
    async def root():
        return {"message": "AcademicRAG API running. Frontend not found."}


# ─── Startup ───────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    app_logger.info("=" * 60)
    app_logger.info("AcademicRAG server starting on http://%s:%d", HOST, PORT)
    app_logger.info("Frontend: %s", FRONTEND_DIR)
    app_logger.info("=" * 60)


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info",
    )
