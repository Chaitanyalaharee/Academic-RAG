"""
AcademicRAG — Text Chunker
Splits document pages into overlapping chunks using LangChain.
"""
import traceback
from typing import List, Dict

from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import CHUNK_SIZE, CHUNK_OVERLAP
from logger import app_logger, error_logger


def chunk_pages(pages: List[Dict]) -> List[Dict]:
    """
    Split a list of page dicts into fixed-size overlapping chunks.

    Args:
        pages: List of {page_number, text, source_file} dicts.

    Returns:
        List of chunk dicts:
        {chunk_id, text, source_file, page_number}

    Raises:
        ValueError: If no text is available after chunking.
    """
    if not pages:
        raise ValueError("No text extracted from document")

    try:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        chunks: List[Dict] = []
        chunk_id = 0

        for page in pages:
            text = page.get("text", "").strip()
            if not text:
                continue

            try:
                text.encode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                raise ValueError("Text contains unsupported characters")

            try:
                splits = splitter.split_text(text)
            except MemoryError:
                raise MemoryError("File too large to process")

            for split_text in splits:
                clean = split_text.strip()
                if not clean:
                    continue
                chunks.append({
                    "chunk_id":    chunk_id,
                    "text":        clean,
                    "source_file": page.get("source_file", "unknown"),
                    "page_number": page.get("page_number", 0),
                })
                chunk_id += 1

        if not chunks:
            raise ValueError("No text extracted from document")

        app_logger.info(
            "Created %d chunks from %d pages (chunk_size=%d, overlap=%d)",
            len(chunks), len(pages), CHUNK_SIZE, CHUNK_OVERLAP
        )
        return chunks

    except (ValueError, MemoryError):
        raise
    except Exception as e:
        error_logger.error(
            "Unexpected chunking error: %s\n%s", e, traceback.format_exc()
        )
        raise ValueError(f"Chunking failed: {e}") from e
