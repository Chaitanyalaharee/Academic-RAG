"""
AcademicRAG — Embedder
Builds FAISS indexes for all three embedding models.
Handles model-specific text prefix rules (E5, BGE, MiniLM).
"""
import pickle
import traceback
from pathlib import Path
from typing import List, Dict, Callable, Optional

import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

from config import MODELS, get_index_path, get_chunks_path, get_passage_prefix
from logger import app_logger, error_logger

_model_cache: Dict[str, SentenceTransformer] = {}


def load_model(model_key: str) -> SentenceTransformer:
    if model_key in _model_cache:
        return _model_cache[model_key]

    model_name = MODELS.get(model_key)
    if not model_name:
        raise ValueError(f"Unknown model key: {model_key}")

    try:
        app_logger.info("Loading model '%s' (%s)…", model_key, model_name)
        model = SentenceTransformer(model_name)
        _model_cache[model_key] = model
        app_logger.info("Model '%s' loaded successfully.", model_key)
        return model
    except Exception as e:
        error_logger.error(
            "Failed to load model '%s': %s\n%s",
            model_key, e, traceback.format_exc()
        )
        raise


def build_index(
    model_key: str,
    chunks: List[Dict],
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> None:

    if not chunks:
        raise ValueError("No chunks available to embed")

    def _progress(frac: float, msg: str):
        if progress_callback:
            try:
                progress_callback(frac, msg)
            except Exception:
                pass

    try:
        _progress(0.0, "Loading model…")
        model = load_model(model_key)

        prefix = get_passage_prefix(model_key)
        texts = [prefix + c["text"] for c in chunks]

        _progress(0.1, f"Embedding {len(texts)} chunks…")
        app_logger.info("Embedding %d chunks for model '%s'…", len(texts), model_key)

        # ✅ FIXED: Safe batch size
        batch_size = 8

        dim = None
        index = None

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]

            embs = model.encode(
                batch,
                show_progress_bar=False,
                normalize_embeddings=True
            )

            embs = np.array(embs).astype("float32")

            # Initialize FAISS index only once
            if index is None:
                dim = embs.shape[1]
                index = faiss.IndexFlatL2(dim)

            index.add(embs)

            frac = 0.1 + 0.7 * ((i + len(batch)) / len(texts))
            _progress(frac, f"Embedded {min(i + batch_size, len(texts))}/{len(texts)} chunks…")

        _progress(0.85, "Building FAISS index…")

        _progress(0.92, "Saving index to disk…")
        index_path = get_index_path(model_key)
        chunks_path = get_chunks_path(model_key)

        faiss.write_index(index, str(index_path))

        with open(chunks_path, "wb") as f:
            pickle.dump(chunks, f)

        _progress(1.0, "Done ✅")

        app_logger.info(
            "Index built for '%s': %d vectors, dim=%d, saved to %s",
            model_key, index.ntotal, dim, index_path
        )

    except Exception as e:
        error_logger.error(
            "Unexpected error building index for '%s': %s\n%s",
            model_key, e, traceback.format_exc()
        )
        raise RuntimeError(f"Index build failed for {model_key}: {e}") from e


def index_exists(model_key: str) -> bool:
    return get_index_path(model_key).exists() and get_chunks_path(model_key).exists()