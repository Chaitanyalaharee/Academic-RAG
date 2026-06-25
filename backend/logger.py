"""
AcademicRAG — Logging System
Three separate loggers: app, error, and query.
"""
import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path

# ─── Ensure log directory ──────────────────────────────────────
LOGS_DIR = Path(__file__).parent / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

LOG_FORMAT = "[%(asctime)s] [%(levelname)s] [%(filename)s:%(lineno)d] %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
MAX_BYTES   = 5 * 1024 * 1024   # 5 MB
BACKUP_COUNT = 3


def _make_logger(name: str, filepath: Path, level: int) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(level)

    if logger.handlers:
        return logger

    handler = RotatingFileHandler(
        filepath,
        maxBytes=MAX_BYTES,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    handler.setLevel(level)
    formatter = logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # Also echo to console
    console_handler = logging.StreamHandler()
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    return logger


# ─── Three public loggers ──────────────────────────────────────
app_logger   = _make_logger("app",   LOGS_DIR / "app.log",     logging.INFO)
error_logger = _make_logger("error", LOGS_DIR / "errors.log",  logging.ERROR)
query_logger = _make_logger("query", LOGS_DIR / "queries.log", logging.INFO)


def log_query(
    question: str,
    model: str,
    latency: float,
    chunk_count: int,
    avg_similarity: float,
    scores: dict,
) -> None:
    """Structured query log entry."""
    query_logger.info(
        "QUERY | model=%s | latency=%.3fs | chunks=%d | "
        "avg_sim=%.4f | rouge1=%.4f | rougeL=%.4f | bert=%.4f | question=%s",
        model,
        latency,
        chunk_count,
        avg_similarity,
        scores.get("rouge1", 0.0),
        scores.get("rougeL", 0.0),
        scores.get("bertscore", 0.0),
        question[:120],
    )
