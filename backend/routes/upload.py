"""
AcademicRAG — Upload Route
POST /api/upload  — accept and save PDF files.
"""
import traceback
from pathlib import Path

import aiofiles
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse

from config import PAPERS_DIR, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB
from logger import app_logger, error_logger

router = APIRouter()


@router.post("/upload")
async def upload_pdf(files: list[UploadFile] = File(...)):
    """Accept one or more PDF files and save them to the papers directory."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    results = []
    for file in files:
        try:
            # Validate file type
            if not file.filename.lower().endswith(".pdf"):
                results.append({
                    "success":  False,
                    "filename": file.filename,
                    "error":    "Only PDF files are accepted",
                    "code":     400,
                })
                continue

            # Read content
            content = await file.read()

            # Validate size
            if len(content) > MAX_FILE_SIZE_BYTES:
                results.append({
                    "success":  False,
                    "filename": file.filename,
                    "error":    f"File exceeds {MAX_FILE_SIZE_MB}MB limit",
                    "code":     413,
                })
                continue

            # Validate not empty
            if len(content) == 0:
                results.append({
                    "success":  False,
                    "filename": file.filename,
                    "error":    "PDF appears to be empty",
                    "code":     400,
                })
                continue

            # Save file
            save_path = PAPERS_DIR / file.filename
            async with aiofiles.open(save_path, "wb") as f:
                await f.write(content)

            size_kb = round(len(content) / 1024, 1)
            app_logger.info("Uploaded '%s' (%.1f KB).", file.filename, size_kb)

            results.append({
                "success":  True,
                "filename": file.filename,
                "size_kb":  size_kb,
                "message":  f"'{file.filename}' uploaded successfully",
            })

        except Exception as e:
            error_logger.error(
                "Upload failed for '%s': %s\n%s",
                getattr(file, "filename", "unknown"), e, traceback.format_exc()
            )
            results.append({
                "success":  False,
                "filename": getattr(file, "filename", "unknown"),
                "error":    "Upload failed due to a server error",
                "code":     500,
                "detail":   str(e),
            })

    return JSONResponse(content={"results": results})
