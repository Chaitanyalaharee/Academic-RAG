"""
AcademicRAG — Retriever
Loads FAISS indexes and retrieves top-K most relevant chunks
for a query, with model-specific query prefix rules.
"""
import pickle
import traceback
from typing import List, Dict

import numpy as np
import faiss

from config import DEFAULT_TOP_K, get_index_path, get_chunks_path, get_query_prefix
from pipeline.embedder import load_model
from logger import app_logger, error_logger

# Cache loaded indexes in memory
_index_cache: Dict[str, faiss.IndexFlatL2] = {}
_chunks_cache: Dict[str, List[Dict]] = {}


def _load_index(model_key: str):
    """Load FAISS index and chunk metadata, using cache."""
    if model_key in _index_cache:
        return _index_cache[model_key], _chunks_cache[model_key]

    index_path  = get_index_path(model_key)
    chunks_path = get_chunks_path(model_key)

    if not index_path.exists() or not chunks_path.exists():
        raise FileNotFoundError(
            "Index not built yet, please build the index first"
        )

    index = faiss.read_index(str(index_path))
    with open(chunks_path, "rb") as f:
        chunks = pickle.load(f)

    _index_cache[model_key]  = index
    _chunks_cache[model_key] = chunks
    app_logger.info("Index for '%s' loaded from disk (%d vectors).", model_key, index.ntotal)
    return index, chunks


def _l2_to_similarity(distance: float) -> float:
    """Convert L2 distance to a 0-1 similarity score."""
    return float(1.0 / (1.0 + distance))


def retrieve(
    model_key: str,
    question: str,
    top_k: int = DEFAULT_TOP_K,
) -> List[Dict]:
    """
    Retrieve top-K chunks most relevant to the question.

    Returns:
        List of chunk dicts with added 'similarity_score' field.

    Raises:
        FileNotFoundError: if index not built.
        ValueError: if question is empty or no results found.
    """
    question = question.strip() if question else ""
    if not question:
        raise ValueError("Question cannot be empty")

    try:
        index, chunks = _load_index(model_key)

        model = load_model(model_key)
        prefix = get_query_prefix(model_key)
        query_text = prefix + question

        query_vec = model.encode(
            [query_text],
            show_progress_bar=False,
            normalize_embeddings=True,
        ).astype("float32")

        k = min(top_k, index.ntotal)
        distances, indices = index.search(query_vec, k)

        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0 or idx >= len(chunks):
                continue
            chunk = dict(chunks[idx])
            chunk["similarity_score"] = _l2_to_similarity(dist)
            results.append(chunk)

        if not results:
            raise ValueError("No relevant content found")

        app_logger.info(
            "Retrieved %d chunks for model '%s' (top_k=%d).",
            len(results), model_key, top_k
        )
        return results

    except (FileNotFoundError, ValueError):
        raise
    except Exception as e:
        error_logger.error(
            "Retrieval error for model '%s': %s\n%s",
            model_key, e, traceback.format_exc()
        )
        raise RuntimeError(f"Retrieval failed for {model_key}: {e}") from e


def invalidate_cache(model_key: str | None = None) -> None:
    """Invalidate index cache after re-building an index."""
    if model_key:
        _index_cache.pop(model_key, None)
        _chunks_cache.pop(model_key, None)
    else:
        _index_cache.clear()
        _chunks_cache.clear()
    app_logger.info("Index cache invalidated for: %s", model_key or "all models")
