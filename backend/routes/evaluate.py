"""
AcademicRAG — Evaluate Route
POST /api/evaluate  — score predicted answers against ground truth
POST /api/batch     — run batch evaluation with SSE progress
"""
import asyncio
import json
import time
import traceback

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse, Response

from config import MODELS
from pipeline.embedder import index_exists
from pipeline.retriever import retrieve
from services.groq_service import generate_answer
from services.evaluator import evaluate_all_models, calculate_scores
from services.report_gen import generate_batch_csv
from logger import app_logger, error_logger, log_query

router = APIRouter()


@router.post("/evaluate")
async def evaluate_endpoint(body: dict):
    """
    Calculate ROUGE and BERTScore for all three model predictions.

    Body: {predicted: {minilm: str, e5: str, bge: str}, ground_truth: str}
    """
    predicted    = body.get("predicted", {})
    ground_truth = body.get("ground_truth", "").strip()

    if not ground_truth:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Required field missing: ground_truth", "code": 400}
        )
    if not predicted:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Required field missing: predicted", "code": 400}
        )

    try:
        scores = await asyncio.get_event_loop().run_in_executor(
            None, evaluate_all_models, predicted, ground_truth
        )
        return JSONResponse(content={"success": True, "scores": scores})
    except ValueError as e:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": str(e), "code": 400}
        )
    except Exception as e:
        error_logger.error("Evaluate error: %s\n%s", e, traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Evaluation failed: {e}", "code": 500}
        )


@router.post("/batch")
async def batch_evaluate(body: dict):
    """
    Run batch evaluation over a list of QA pairs for all 3 models.
    Streams SSE progress events, then returns full results.
    """
    qa_pairs = body.get("qa_pairs", [])
    top_k    = int(body.get("top_k", 5))

    if not qa_pairs:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Required field missing: qa_pairs", "code": 400}
        )

    any_index = any(index_exists(k) for k in MODELS)
    if not any_index:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Please build the index before batch evaluation", "code": 400}
        )

    async def stream():
        all_results = []
        totals = {k: {"rouge1": 0.0, "rougeL": 0.0, "bertscore": 0.0, "latency": 0.0, "wins": 0} for k in MODELS}

        for qi, pair in enumerate(qa_pairs):
            question     = pair.get("question", "").strip()
            ground_truth = pair.get("answer",   "").strip()

            yield f"data: {json.dumps({'type': 'progress', 'current': qi + 1, 'total': len(qa_pairs), 'question': question[:80]})}\n\n"
            await asyncio.sleep(0)

            if not question:
                continue

            row = {"question_index": qi + 1, "question": question}
            predictions = {}

            for model_key in MODELS:
                if not index_exists(model_key):
                    continue
                try:
                    t0     = time.perf_counter()
                    chunks = retrieve(model_key, question, top_k=top_k)
                    answer, llm_lat = await asyncio.get_event_loop().run_in_executor(
                        None, generate_answer, question, chunks
                    )
                    latency = time.perf_counter() - t0
                    predictions[model_key] = answer
                    row[f"{model_key}_latency"] = round(latency, 3)
                except Exception as e:
                    predictions[model_key]      = ""
                    row[f"{model_key}_latency"] = 0.0
                    error_logger.error(
                        "Batch query error model=%s q=%d: %s\n%s",
                        model_key, qi, e, traceback.format_exc()
                    )

            # Score if ground truth available
            if ground_truth and predictions:
                try:
                    scores = await asyncio.get_event_loop().run_in_executor(
                        None, evaluate_all_models, predictions, ground_truth
                    )
                    winner = max(scores, key=lambda k: scores[k].get("bertscore", 0.0))
                    row["winner"] = winner
                    for mk, sc in scores.items():
                        row[f"{mk}_rouge1"]     = sc.get("rouge1",    0.0)
                        row[f"{mk}_rougeL"]     = sc.get("rougeL",    0.0)
                        row[f"{mk}_bertscore"]  = sc.get("bertscore", 0.0)
                        totals[mk]["rouge1"]    += sc.get("rouge1",    0.0)
                        totals[mk]["rougeL"]    += sc.get("rougeL",    0.0)
                        totals[mk]["bertscore"] += sc.get("bertscore", 0.0)
                        totals[mk]["latency"]   += row.get(f"{mk}_latency", 0.0)
                        if sc.get("win"):
                            totals[mk]["wins"] += 1
                except Exception as e:
                    error_logger.error("Batch score error q=%d: %s", qi, e)

            all_results.append(row)

        n = max(len(qa_pairs), 1)
        averages = {}
        for mk in MODELS:
            averages[mk] = {
                "avg_rouge1":     round(totals[mk]["rouge1"]    / n, 4),
                "avg_rougeL":     round(totals[mk]["rougeL"]    / n, 4),
                "avg_bertscore":  round(totals[mk]["bertscore"] / n, 4),
                "avg_latency":    round(totals[mk]["latency"]   / n, 3),
                "win_count":      totals[mk]["wins"],
                "win_pct":        f"{totals[mk]['wins']}/{n}",
            }

        # Generate downloadable CSV
        csv_str = generate_batch_csv(all_results)

        yield f"data: {json.dumps({'type': 'complete', 'results': all_results, 'averages': averages, 'csv': csv_str})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
