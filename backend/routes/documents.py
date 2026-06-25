"""
AcademicRAG — Documents Route
GET    /api/documents         — list all uploaded PDFs
DELETE /api/documents/{name}  — delete a PDF
"""
import traceback
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from config import PAPERS_DIR
from logger import app_logger, error_logger

router = APIRouter()


@router.get("/documents")
async def list_documents():
    """Return metadata for all uploaded PDFs."""
    try:
        files = sorted(PAPERS_DIR.glob("*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True)
        docs = []
        for f in files:
            stat = f.stat()
            docs.append({
                "filename":    f.name,
                "size_kb":     round(stat.st_size / 1024, 1),
                "upload_date": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
            })
        return JSONResponse(content={"success": True, "documents": docs, "count": len(docs)})
    except Exception as e:
        error_logger.error("Failed to list documents: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail="Failed to list documents")


@router.delete("/documents/{filename}")
async def delete_document(filename: str):
    """Delete an uploaded PDF by filename."""
    try:
        # Sanitise — only allow the filename component
        safe_name = Path(filename).name
        target = PAPERS_DIR / safe_name

        if not target.exists():
            raise HTTPException(status_code=404, detail=f"File '{safe_name}' not found")

        target.unlink()
        app_logger.info("Deleted document '%s'.", safe_name)
        return JSONResponse(content={"success": True, "message": f"'{safe_name}' deleted"})

    except HTTPException:
        raise
    except Exception as e:
        error_logger.error("Failed to delete '%s': %s\n%s", filename, e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")
