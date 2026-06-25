"""
AcademicRAG — Groq Service
Generates answers from retrieved chunks using Groq's LLM API.
Measures exact latency per call and handles rate limiting.
"""
import time
import traceback
from typing import List, Dict, Tuple

from groq import Groq, RateLimitError, AuthenticationError, APITimeoutError

from config import (
    GROQ_API_KEY,
    GROQ_MODEL,
    GROQ_TEMPERATURE,
    GROQ_MAX_TOKENS,
    GROQ_SYSTEM_PROMPT,
)
from logger import app_logger, error_logger

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        if not GROQ_API_KEY:
            raise ValueError("Invalid Groq API key, check your .env file")
        _client = Groq(api_key=GROQ_API_KEY)
    return _client


def _build_context(chunks: List[Dict]) -> str:
    """Build a formatted context string from retrieved chunks."""
    parts = []
    for i, chunk in enumerate(chunks, 1):
        source = chunk.get("source_file", "unknown")
        text   = chunk.get("text", "")
        parts.append(f"[Source {i}: {source}]\n{text}")
    return "\n\n---\n\n".join(parts)


def generate_answer(
    question: str,
    chunks: List[Dict],
    max_retries: int = 3,
) -> Tuple[str, float]:
    """
    Generate an answer from the given chunks using Groq.

    Args:
        question:    The user's question.
        chunks:      Retrieved chunks from FAISS.
        max_retries: Number of retry attempts on rate limit.

    Returns:
        (answer_text, latency_seconds)

    Raises:
        ValueError: on auth error or empty response.
        RuntimeError: on timeout or unrecoverable error.
    """
    if not question.strip():
        raise ValueError("Question cannot be empty")
    ##if not chunks:
        #raise ValueError("No chunks provided for answer generation")
    
    if chunks:
        context = _build_context(chunks)

        user_message = f"""
    Context from uploaded documents:

    {context}

    Question: {question}

    Answer ONLY using the provided context.
    If answer is not present, say:
    'Answer not found in uploaded documents.'
    """
    else:
        user_message = f"""
    Question: {question}

    Answer normally using your general knowledge.
    """

    context = _build_context(chunks)
    user_message = (
        f"Context from research papers:\n\n{context}\n\n"
        f"Question: {question}\n\n"
        "Answer based only on the context above:"
    )

    attempt = 0
    while attempt < max_retries:
        try:
            client = _get_client()
            start = time.perf_counter()

            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": GROQ_SYSTEM_PROMPT},
                    {"role": "user",   "content": user_message},
                ],
                temperature=GROQ_TEMPERATURE,
                max_tokens=GROQ_MAX_TOKENS,
            )

            latency = time.perf_counter() - start

            choices = response.choices
            if not choices or not choices[0].message or not choices[0].message.content:
                raise ValueError("Groq returned an empty response")

            answer = choices[0].message.content.strip()
            app_logger.info(
                "Groq answer generated in %.3fs (%d tokens used).",
                latency,
                response.usage.total_tokens if response.usage else 0,
            )
            return answer, latency

        except AuthenticationError as e:
            raise ValueError("Invalid Groq API key, check your .env file") from e

        except RateLimitError:
            attempt += 1
            if attempt >= max_retries:
                raise RuntimeError("Groq rate limit reached, retrying in 2 seconds")
            app_logger.warning(
                "Groq rate limit hit, retrying in 2s (attempt %d/%d)…",
                attempt, max_retries
            )
            time.sleep(2)

        except APITimeoutError as e:
            raise RuntimeError("Groq API request timed out") from e

        except (ValueError, RuntimeError):
            raise

        except Exception as e:
            error_logger.error(
                "Unexpected Groq error: %s\n%s", e, traceback.format_exc()
            )
            raise RuntimeError(f"Groq request failed: {e}") from e

    raise RuntimeError("Groq rate limit reached after all retries")
