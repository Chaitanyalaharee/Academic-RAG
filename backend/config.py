"""
AcademicRAG — Central Configuration
All constants and settings for the entire application.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ─── Base Paths ────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
PAPERS_DIR = DATA_DIR / "papers"
VECTOR_STORE_DIR = DATA_DIR / "vector_stores"
LOGS_DIR = BASE_DIR / "logs"

# ─── Ensure directories exist ──────────────────────────────────
PAPERS_DIR.mkdir(parents=True, exist_ok=True)
VECTOR_STORE_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# ─── Embedding Models ──────────────────────────────────────────
MODELS = {
    "minilm": "sentence-transformers/all-MiniLM-L6-v2",
    "e5":     "intfloat/e5-large-v2",
    "bge":    "BAAI/bge-large-en-v1.5",
}

MODEL_DIMENSIONS = {
    "minilm": 384,
    "e5":     1024,
    "bge":    1024,
}

MODEL_LABELS = {
    "minilm": "MiniLM-L6-v2",
    "e5":     "E5-Large-v2",
    "bge":    "BGE-Large-v1.5",
}

# ─── Chunking ──────────────────────────────────────────────────
CHUNK_SIZE    = 900
CHUNK_OVERLAP = 200

# ─── Retrieval ─────────────────────────────────────────────────
DEFAULT_TOP_K = 5

# ─── File Limits ───────────────────────────────────────────────
MAX_FILE_SIZE_MB    = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# ─── Groq LLM ──────────────────────────────────────────────────
GROQ_API_KEY     = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL       = "llama-3.1-8b-instant"
GROQ_TEMPERATURE = 0.1
GROQ_MAX_TOKENS  = 512

GROQ_SYSTEM_PROMPT = (
    "You are an academic research assistant. Answer questions "
    "using ONLY the provided context from research papers. "
    "Always cite the source paper name in your answer. "
    "If the answer is not found in the context, respond with "
    "exactly: Not found in the provided documents. "
    "Be concise, precise, and academic in tone."
)

# ─── Server ────────────────────────────────────────────────────
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# ─── Vector Store file names ───────────────────────────────────
def get_index_path(model_key: str) -> Path:
    return VECTOR_STORE_DIR / f"{model_key}_index.faiss"

def get_chunks_path(model_key: str) -> Path:
    return VECTOR_STORE_DIR / f"{model_key}_chunks.pkl"

# ─── Model-specific prefix rules ───────────────────────────────
def get_passage_prefix(model_key: str) -> str:
    if model_key == "e5":
        return "passage: "
    return ""

def get_query_prefix(model_key: str) -> str:
    if model_key == "e5":
        return "query: "
    if model_key == "bge":
        return "Represent this sentence for searching relevant passages: "
    return ""
