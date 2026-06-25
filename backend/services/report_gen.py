"""
AcademicRAG — Report Generator
Generates CSV reports from query history and batch evaluation results.
"""
import csv
import io
import json
import traceback
from pathlib import Path
from typing import List, Dict

from config import LOGS_DIR
from logger import app_logger, error_logger


def generate_query_csv(history_entries: List[Dict]) -> str:
    """
    Convert a list of query history entries into a CSV string.

    Args:
        history_entries: List of dicts from query history.

    Returns:
        CSV string (UTF-8).
    """
    try:
        output = io.StringIO()
        fieldnames = [
            "timestamp", "question",
            "model", "latency_s",
            "chunk_count", "avg_similarity",
            "rouge1", "rougeL", "bertscore",
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for entry in history_entries:
            writer.writerow(entry)
        return output.getvalue()
    except Exception as e:
        error_logger.error(
            "Failed to generate query CSV: %s\n%s", e, traceback.format_exc()
        )
        raise RuntimeError(f"CSV generation failed: {e}") from e


def generate_batch_csv(batch_results: List[Dict]) -> str:
    """
    Convert batch evaluation results into a CSV string.

    Args:
        batch_results: List of per-question result dicts.

    Returns:
        CSV string (UTF-8).
    """
    try:
        output = io.StringIO()
        fieldnames = [
            "question_index", "question",
            "minilm_rouge1", "minilm_rougeL", "minilm_bertscore", "minilm_latency",
            "e5_rouge1",     "e5_rougeL",     "e5_bertscore",     "e5_latency",
            "bge_rouge1",    "bge_rougeL",    "bge_bertscore",    "bge_latency",
            "winner",
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for entry in batch_results:
            writer.writerow(entry)
        return output.getvalue()
    except Exception as e:
        error_logger.error(
            "Failed to generate batch CSV: %s\n%s", e, traceback.format_exc()
        )
        raise RuntimeError(f"Batch CSV generation failed: {e}") from e


def read_query_history(max_entries: int = 50) -> List[Dict]:
    """
    Read structured query entries from queries.log.

    Returns:
        List of dicts parsed from log lines, newest first.
    """
    log_path = LOGS_DIR / "queries.log"
    entries: List[Dict] = []

    if not log_path.exists():
        return entries

    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        for line in reversed(lines):
            line = line.strip()
            if not line or "QUERY |" not in line:
                continue
            try:
                # Parse the structured log line
                parts = {}
                # Extract timestamp from prefix [TIMESTAMP]
                ts_start = line.find("[") + 1
                ts_end   = line.find("]")
                timestamp = line[ts_start:ts_end] if ts_start > 0 and ts_end > 0 else ""

                # Extract key=value pairs
                kv_part = line[line.find("QUERY |"):]
                for segment in kv_part.split("|"):
                    segment = segment.strip()
                    if "=" in segment:
                        k, v = segment.split("=", 1)
                        parts[k.strip()] = v.strip()

                entries.append({
                    "timestamp":      timestamp,
                    "model":          parts.get("model", ""),
                    "latency_s":      parts.get("latency", ""),
                    "chunk_count":    parts.get("chunks", ""),
                    "avg_similarity": parts.get("avg_sim", ""),
                    "rouge1":         parts.get("rouge1", ""),
                    "rougeL":         parts.get("rougeL", ""),
                    "bertscore":      parts.get("bert", ""),
                    "question":       parts.get("question", ""),
                })

                if len(entries) >= max_entries:
                    break
            except Exception:
                continue

        app_logger.info("Read %d query history entries from log.", len(entries))
        return entries

    except Exception as e:
        error_logger.error(
            "Failed to read query history: %s\n%s", e, traceback.format_exc()
        )
        return []
