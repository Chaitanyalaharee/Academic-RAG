"""
AcademicRAG — Query Route
POST /api/query       — run RAG pipeline for all 3 models
GET  /api/index/status — return index build status
POST /api/index       — build FAISS indexes (SSE streaming)
GET  /api/health      — server health check
GET  /api/history     — return last 50 query log entries
GET  /api/export      — export query history as CSV
"""
import asyncio
import json
import time
import traceback
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse, Response

from config import MODELS, PAPERS_DIR
from pipeline.pdf_parser import parse_all_pdfs
from pipeline.chunker import chunk_pages
from pipeline.embedder import build_index, index_exists
from pipeline.retriever import retrieve, invalidate_cache
from services.groq_service import generate_answer
from services.report_gen import read_query_history, generate_query_csv
from logger import app_logger, error_logger, log_query

router = APIRouter()


# ─── Health ────────────────────────────────────────────────────

@router.get("/health")
async def health():
    papers = list(PAPERS_DIR.glob("*.pdf"))
    status = {
        "status":        "online",
        "papers_count":  len(papers),
        "index_status":  {k: index_exists(k) for k in MODELS},
    }
    return JSONResponse(content=status)


# ─── Index Status ──────────────────────────────────────────────

@router.get("/index/status")
async def index_status():
    return JSONResponse(content={k: index_exists(k) for k in MODELS})


# ─── Build Index (SSE) ─────────────────────────────────────────

@router.post("/index")
async def build_index_endpoint():
    """
    Build FAISS indexes for all 3 models.
    Streams Server-Sent Events with progress updates.
    """
    async def event_stream():
        try:
            # Parse PDFs
            yield f"data: {json.dumps({'model': 'system', 'progress': 0, 'status': 'Parsing PDF documents…'})}\n\n"
            await asyncio.sleep(0)

            pages = parse_all_pdfs(PAPERS_DIR)
            if not pages:
                yield f"data: {json.dumps({'model': 'system', 'progress': 0, 'status': 'Error: No PDF files found', 'error': True})}\n\n"
                return

            yield f"data: {json.dumps({'model': 'system', 'progress': 5, 'status': f'Parsed {len(pages)} pages, chunking…'})}\n\n"
            await asyncio.sleep(0)

            chunks = chunk_pages(pages)
            yield f"data: {json.dumps({'model': 'system', 'progress': 10, 'status': f'Created {len(chunks)} chunks. Starting indexing…'})}\n\n"
            await asyncio.sleep(0)

            model_keys = list(MODELS.keys())
            model_count = len(model_keys)
            start_time = time.perf_counter()

            for model_idx, model_key in enumerate(model_keys):
                base_progress = 10 + model_idx * (90 // model_count)

                def make_callback(mk, base):
                    def cb(fraction: float, msg: str):
                        prog = int(base + fraction * (90 // model_count))
                        pass  # We yield via queue below
                    return cb

                progress_queue = asyncio.Queue()

                def make_async_callback(mk, base, q):
                    def cb(fraction: float, msg: str):
                        prog = int(base + fraction * (90 // model_count))
                        try:
                            q.put_nowait({
                                "model":    mk,
                                "progress": prog,
                                "status":   msg,
                            })
                        except asyncio.QueueFull:
                            pass
                    return cb

                callback = make_async_callback(model_key, base_progress, progress_queue)

                loop = asyncio.get_event_loop()
                index_task = loop.run_in_executor(
                    None, build_index, model_key, chunks, callback
                )

                while not index_task.done():
                    try:
                        event = progress_queue.get_nowait()
                        yield f"data: {json.dumps(event)}\n\n"
                    except asyncio.QueueEmpty:
                        pass
                    await asyncio.sleep(0.2)

                # Drain remaining queue
                while not progress_queue.empty():
                    try:
                        event = progress_queue.get_nowait()
                        yield f"data: {json.dumps(event)}\n\n"
                    except asyncio.QueueEmpty:
                        break

                try:
                    await index_task
                    invalidate_cache(model_key)
                    yield f"data: {json.dumps({'model': model_key, 'progress': base_progress + (90 // model_count), 'status': 'Done ✅', 'done': True})}\n\n"
                except Exception as e:
                    error_logger.error(
                        "Index build failed for '%s': %s\n%s",
                        model_key, e, traceback.format_exc()
                    )
                    yield f"data: {json.dumps({'model': model_key, 'progress': base_progress, 'status': f'Error: {e}', 'error': True})}\n\n"

            elapsed = round(time.perf_counter() - start_time, 1)
            yield f"data: {json.dumps({'model': 'system', 'progress': 100, 'status': f'All indexes built in {elapsed}s', 'complete': True, 'time_taken': elapsed})}\n\n"

        except Exception as e:
            error_logger.error(
                "Index build stream error: %s\n%s", e, traceback.format_exc()
            )
            yield f"data: {json.dumps({'model': 'system', 'progress': 0, 'status': f'Fatal error: {e}', 'error': True})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ─── Query ─────────────────────────────────────────────────────

@router.post("/query")
async def query_endpoint(body: dict):
    """Run the full RAG pipeline for all 3 models and return comparison results."""
    question = body.get("question", "").strip()
    top_k    = int(body.get("top_k", 5))

    if not question:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Required field missing: question", "code": 400}
        )

    any_index = any(index_exists(k) for k in MODELS)
    if not any_index:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Please build the index before querying", "code": 400}
        )

    results = {}
    for model_key in MODELS:
        if not index_exists(model_key):
            results[model_key] = {
                "success": False,
                "error":   f"Index not built for {model_key}",
            }
            continue

        try:
            t0 = time.perf_counter()
            chunks = retrieve(model_key, question, top_k=top_k)
            retrieval_latency = time.perf_counter() - t0

            answer, llm_latency = await asyncio.get_event_loop().run_in_executor(
                None, generate_answer, question, chunks
            )
            total_latency = retrieval_latency + llm_latency

            avg_sim = round(
                sum(c["similarity_score"] for c in chunks) / len(chunks), 4
            ) if chunks else 0.0

            serialisable_chunks = [
                {
                    "chunk_id":        c.get("chunk_id", i),
                    "text":            c.get("text", "")[:500],
                    "source_file":     c.get("source_file", ""),
                    "page_number":     c.get("page_number", 0),
                    "similarity_score": round(c.get("similarity_score", 0.0), 4),
                }
                for i, c in enumerate(chunks)
            ]

            results[model_key] = {
                "success":           True,
                "answer":            answer,
                "retrieval_latency": round(retrieval_latency, 3),
                "llm_latency":       round(llm_latency, 3),
                "total_latency":     round(total_latency, 3),
                "chunk_count":       len(chunks),
                "avg_similarity":    avg_sim,
                "chunks":            serialisable_chunks,
            }

            log_query(
                question=question,
                model=model_key,
                latency=total_latency,
                chunk_count=len(chunks),
                avg_similarity=avg_sim,
                scores={},
            )

        except FileNotFoundError as e:
            results[model_key] = {"success": False, "error": str(e)}
        except ValueError as e:
            results[model_key] = {"success": False, "error": str(e)}
        except Exception as e:
            error_logger.error(
                "Query failed for model '%s': %s\n%s",
                model_key, e, traceback.format_exc()
            )
            results[model_key] = {
                "success": False,
                "error":   f"Query failed: {e}",
                "detail":  traceback.format_exc(),
            }

    return JSONResponse(content={
        "success":  True,
        "question": question,
        "results":  results,
    })


# ─── History ───────────────────────────────────────────────────

@router.get("/history")
async def get_history():
    entries = read_query_history(max_entries=50)
    return JSONResponse(content={"success": True, "history": entries})


# ─── Export CSV ────────────────────────────────────────────────

@router.get("/export")
async def export_csv():
    entries = read_query_history(max_entries=1000)
    csv_data = generate_query_csv(entries)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=academicrag_history.csv"},
    )
