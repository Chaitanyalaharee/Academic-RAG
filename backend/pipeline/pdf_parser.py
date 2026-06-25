"""
AcademicRAG — PDF Parser
Extracts text from uploaded PDF files using PyMuPDF (fitz).
"""
import traceback
from pathlib import Path
from typing import List, Dict

import fitz  # PyMuPDF

from logger import app_logger, error_logger


def parse_pdf(filepath: str | Path) -> List[Dict]:
    """
    Extract text from a PDF file, page by page.

    Returns:
        List of dicts: [{page_number, text, source_file}]

    Raises:
        ValueError: for empty, corrupted, or protected PDFs.
        FileNotFoundError: if file does not exist.
    """
    filepath = Path(filepath)
    source_name = filepath.name

    try:
        if not filepath.exists():
            raise FileNotFoundError(f"PDF file not found on disk: {filepath}")

        if filepath.stat().st_size == 0:
            raise ValueError("PDF appears to be empty")

        try:
            doc = fitz.open(str(filepath))
        except fitz.FileDataError as e:
            raise ValueError(f"PDF file is corrupted or unreadable: {e}") from e

        if doc.needs_pass:
            doc.close()
            raise ValueError("PDF is password protected")

        if doc.page_count == 0:
            doc.close()
            raise ValueError("PDF appears to be empty")

        pages = []
        for page_num in range(doc.page_count):
            try:
                page = doc[page_num]
                text = page.get_text("text")
                if text:
                    try:
                        text = text.encode("utf-8", errors="replace").decode("utf-8")
                    except Exception:
                        raise ValueError("Text encoding error in PDF")
                    pages.append({
                        "page_number": page_num + 1,
                        "text": text.strip(),
                        "source_file": source_name,
                    })
            except ValueError:
                raise
            except Exception as e:
                error_logger.error(
                    "Error reading page %d of %s: %s\n%s",
                    page_num + 1, source_name, e, traceback.format_exc()
                )

        doc.close()

        if not pages:
            raise ValueError("PDF appears to be empty")

        app_logger.info(
            "Parsed PDF '%s': %d pages, %d pages with text",
            source_name, doc.page_count if not doc.is_closed else "?", len(pages)
        )
        return pages

    except (ValueError, FileNotFoundError):
        raise
    except Exception as e:
        error_logger.error(
            "Unexpected error parsing PDF '%s': %s\n%s",
            source_name, e, traceback.format_exc()
        )
        raise ValueError(f"PDF file is corrupted or unreadable: {e}") from e


def parse_all_pdfs(papers_dir: str | Path) -> List[Dict]:
    """
    Parse all PDFs in a directory.

    Returns:
        Combined list of page dicts from all PDFs.
    """
    papers_dir = Path(papers_dir)
    all_pages: List[Dict] = []
    pdf_files = list(papers_dir.glob("*.pdf"))

    if not pdf_files:
        app_logger.warning("No PDF files found in %s", papers_dir)
        return []

    for pdf_path in pdf_files:
        try:
            pages = parse_pdf(pdf_path)
            all_pages.extend(pages)
            app_logger.info("Loaded %d pages from '%s'", len(pages), pdf_path.name)
        except Exception as e:
            error_logger.error(
                "Skipping '%s' due to parse error: %s\n%s",
                pdf_path.name, e, traceback.format_exc()
            )

    app_logger.info(
        "Total pages parsed from %d PDFs: %d",
        len(pdf_files), len(all_pages)
    )
    return all_pages
