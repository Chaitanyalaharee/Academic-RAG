# AcademicRAG — Embedding Model Comparison System

AcademicRAG is a complete Retrieval-Augmented Generation (RAG) research platform that lets you upload academic PDF papers, ask natural language questions, and compare how three different transformer embedding models retrieve information and generate answers using the Groq LLM API. Everything runs locally — embeddings are computed on your machine using free HuggingFace models, so there are no hidden API costs beyond Groq.

This system was built to answer a concrete research question: **which embedding model performs best for academic document question answering — MiniLM (fast baseline), E5-Large (instruction-tuned), or BGE-Large (top MTEB benchmark)?** By comparing ROUGE, BERTScore, retrieval latency, and chunk similarity scores side by side, you will quickly discover the speed-accuracy tradeoff that matters most for your use case.

---

## Features

- PDF upload with drag-and-drop, file validation, and delete management
- Three embedding model comparison: MiniLM vs E5-Large vs BGE-Large
- Side-by-side answer cards with latency, similarity scores, and source chunks
- Live latency race bar animated in real time as each model finishes
- Chunk relevance heatmap: color-coded similarity per chunk per model
- Accuracy scoring with ROUGE-1, ROUGE-L, and BERTScore against ground truth
- Grouped bar chart comparing all accuracy metrics across models
- Speed vs Accuracy bubble chart showing the core research tradeoff
- Radar chart for overall model capability profiling (Batch page)
- Line chart showing BERTScore trend across all batch questions
- Batch evaluation with full QA JSON dataset support
- Query history panel showing last 10 questions with timestamps
- Export query history and batch results as CSV
- Dark and light mode toggle
- Server health monitoring with offline banner

---

## The Three Models Explained

**MiniLM-L6-v2**
- HuggingFace ID: `sentence-transformers/all-MiniLM-L6-v2`
- A lightweight 22M-parameter model distilled from larger models. Produces 384-dimensional embeddings. Chosen as the speed baseline — it downloads fast (~90MB), indexes quickly, and retrieves in milliseconds. Best for high-volume or latency-critical applications where medium accuracy is acceptable.
- Expected speed: Fast (under 0.5s per query)
- Expected accuracy: Medium

**E5-Large-v2**
- HuggingFace ID: `intfloat/e5-large-v2`
- A 335M-parameter instruction-tuned model that produces 1024-dimensional embeddings. Uses "query:" and "passage:" prefix instructions to separate retrieval context from query context. Achieves high accuracy while remaining practical for production use. Recommended for most academic RAG applications.
- Expected speed: Balanced (0.5–1.5s per query)
- Expected accuracy: High

**BGE-Large-v1.5**
- HuggingFace ID: `BAAI/bge-large-en-v1.5`
- BAAI's flagship 335M-parameter model with 1024-dimensional embeddings. Tops the MTEB benchmark for retrieval tasks. Uses a retrieval-specific instruction prefix during query encoding. Best raw accuracy but slowest and highest RAM requirement.
- Expected speed: Slower (1–3s per query)
- Expected accuracy: Very High

---

## System Requirements

Before starting, make sure you have:

- **Python 3.10 or higher** — check with `python --version` in your terminal
- **pip** — comes with Python, check with `pip --version`
- **Git** — to clone the project (optional if you download the ZIP)
- **At least 16GB RAM** — BGE and E5 each require ~4GB RAM during indexing. You have 16GB which is sufficient.
- **At least 5GB free disk space** — for model downloads (MiniLM 90MB + E5 1.3GB + BGE 1.3GB + indexes)
- **Internet connection** — required only on first run to download model weights from HuggingFace
- **A free Groq API key** — see Step 0 below

---

## Step 0 — Get Your Free Groq API Key

1. Go to https://console.groq.com
2. Click **Sign Up** and create a free account (takes about 1 minute)
3. After logging in, click **"API Keys"** in the left sidebar
4. Click **"Create API Key"**
5. Give it a name like "AcademicRAG" and click Create
6. **Copy the key immediately** — you will not see it again after closing the dialog
7. This key goes in your `.env` file as `GROQ_API_KEY=gsk_xxxxx...`

The free Groq tier is generous for research use. No credit card required.

---

## Step 1 — Clone or Download the Project

**If using Git:**
```
git clone <repo-url>
cd project
```

**If downloaded as ZIP:**
- Extract the ZIP file to a folder of your choice
- Open Command Prompt or PowerShell inside the `project` folder

---

## Step 2 — Create Virtual Environment

A virtual environment keeps this project's dependencies separate from your system Python. Always use one.

**On Windows (Command Prompt or PowerShell):**
```
python -m venv venv
venv\Scripts\activate
```

**On Mac/Linux:**
```
python -m venv venv
source venv/bin/activate
```

You should see `(venv)` appear at the start of your terminal prompt. This confirms the virtual environment is active. Every command from here must be run with this active.

---

## Step 3 — Install Dependencies

```
pip install -r requirements.txt
```

**This will take 5 to 15 minutes on first run.** It downloads PyTorch (~800MB), Transformers, FAISS, and many other packages. Do not close the terminal. You will see progress bars for each package.

If pip seems stuck on PyTorch, try this first then re-run the main install:
```
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

---

## Step 4 — Set Up Environment Variables

**Copy the example file:**
```
copy .env.example .env
```

**Open `.env` in Notepad or any text editor.** You will see:
```
GROQ_API_KEY=your_groq_api_key_here
HOST=0.0.0.0
PORT=8000
```

Replace `your_groq_api_key_here` with your actual Groq API key. It should look like:
```
GROQ_API_KEY=gsk_abc123xyz456...
```

No quotes around the key. No spaces. Save the file.

---

## Step 5 — Run the Project

```
cd backend
python main.py
```

You will see output like:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Open your browser and go to: **http://localhost:8000**

The AcademicRAG dashboard will load automatically. Leave the terminal open — closing it stops the server.

---

## Step 6 — First Time Setup in the App

1. Click **"Document Manager"** in the left sidebar
2. Drag and drop your PDF research papers onto the upload zone (or click to browse)
   - Recommended: upload at least 3 papers for meaningful comparison
   - Any academic PDF works — research papers, theses, textbooks
3. Click **"Build Index for All Models"**
4. Watch the progress bars fill as each model indexes your documents:
   - MiniLM: approximately 1 minute per 10 papers (downloads ~90MB on first run)
   - E5-Large: approximately 3 minutes per 10 papers (downloads ~1.3GB on first run)
   - BGE-Large: approximately 5 minutes per 10 papers (downloads ~1.3GB on first run)
   - Model weights are cached locally — subsequent runs are much faster
5. When all three show "Done ✅", go to **"Ask & Compare"**
6. Type your question and click **"Search All Models"**
7. View the three answers, chunk heatmap, latency race, and comparison charts

---

## How to Use Each Feature

**Dashboard Page**
Shows the three model info cards with their current index status, embedding dimensions, and speed/accuracy ratings. The stats bar shows how many papers you have uploaded and how many indexes are built. Use this page to get a quick overview before starting.

**Document Manager Page**
Upload PDFs by dragging them onto the drop zone or clicking to browse. Files are saved to `backend/data/papers/`. The documents list shows all uploaded files with size and date. Click "Build Index for All Models" to start the indexing pipeline — this parses all PDFs, splits them into 512-token chunks, embeds each chunk with all three models, and saves FAISS indexes to `backend/data/vector_stores/`.

**Ask & Compare Page**
Type a question in the search box. Use the Top-K slider to control how many chunks each model retrieves (3 to 10). Click "Search All Models". The live latency race bar animates as models complete. The three answer cards show the full answer, latency breakdown, and average similarity score. Click "View Retrieved Chunks" on any card to see exactly which text passages were used. The chunk heatmap shows color-coded similarity scores across all models. Enter a ground truth answer and click "Calculate Accuracy Scores" to get ROUGE and BERTScore comparisons with charts.

**Batch Evaluation Page**
Load a JSON file of question-answer pairs (see format below). Click "Run Batch Evaluation" to run all questions through all three models. A live progress indicator shows which question is being processed. When complete, the summary table shows average scores per model, a radar chart shows overall model profiles, and a line chart shows score consistency across all questions. Download the full results as CSV.

---

## Sample QA Dataset Format

Create a `.json` file with this structure for batch evaluation:

```json
[
  {
    "question": "What is the attention mechanism?",
    "answer": "The attention mechanism allows the model to focus on different parts of the input sequence when producing each output token."
  },
  {
    "question": "What are the limitations of BERT?",
    "answer": "BERT is limited by its 512 token maximum input length and high computational cost."
  },
  {
    "question": "How does positional encoding work in transformers?",
    "answer": "Positional encoding adds position information to token embeddings using sine and cosine functions of different frequencies."
  }
]
```

A sample file is included at `backend/data/qa_dataset.json`.

---

## Understanding the Metrics

**ROUGE-1** measures the overlap of individual words (unigrams) between the model's answer and the ground truth. A score of 0.70 means 70% of the important words appear in the answer. Higher is better.

**ROUGE-L** measures the longest common subsequence between the answer and ground truth. It captures sentence-level structure better than ROUGE-1. Higher is better.

**BERTScore** measures semantic similarity using contextual BERT embeddings. Unlike ROUGE, it understands that "automobile" and "car" are the same concept. Scores above 0.85 are generally considered good. This is the most reliable metric for answer quality.

**Latency** is the total time from receiving your question to returning the answer — including retrieval from FAISS plus LLM generation via Groq. Measured in seconds.

**Similarity Score** is how relevant the retrieved chunks are to your question, measured on a scale of 0 to 1. Scores above 0.80 (green) indicate excellent retrieval. Below 0.60 (red) suggests the indexed content may not contain a good answer to that question.

---

## Troubleshooting

**Problem: `pip install` fails on torch**

Solution: Install PyTorch separately first, then install the rest:
```
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
```

**Problem: "Index not found error" when querying**

Solution: You must build the index first. Go to the Document Manager page, upload at least one PDF, and click "Build Index for All Models". Wait for all progress bars to show "Done ✅".

**Problem: "Invalid Groq API key" error**

Solution: Open your `.env` file and check that:
- The key starts with `gsk_`
- There are no quotes around the key
- There are no spaces before or after the key
- The file is saved and named exactly `.env` (not `.env.txt`)

Correct format: `GROQ_API_KEY=gsk_xxxxxxxxxxxxx`

**Problem: Out of memory error during indexing**

Solution: Close Chrome, VS Code, and other memory-heavy applications. With 16GB RAM you should be fine for all three models, but indexing all three simultaneously may be tight. The system indexes them sequentially, so peak usage is roughly 4–5GB. If it still fails, try setting `CHUNK_SIZE = 256` in `config.py` to reduce memory usage.

**Problem: Model download stuck or failed**

Solution: Check your internet connection. Models download from HuggingFace on first run only. If the download is very slow, it will eventually complete — HuggingFace can be slow in some regions. The downloads are cached at `~/.cache/huggingface/` so you only pay this cost once.

**Problem: Port 8000 already in use**

Solution: Either close the other application using port 8000, or change the port in your `.env` file:
```
PORT=8001
```
Then access the app at `http://localhost:8001`.

To find what's using port 8000 on Windows:
```
netstat -ano | findstr :8000
```
Note the PID in the last column, then:
```
taskkill /PID <pid> /F
```

**Problem: Frontend shows "Server Offline" banner**

Solution: Make sure the backend is running in a terminal window. You must be inside the `backend` folder when running `python main.py`. Check the terminal for any Python error messages.

**Problem: BGE or E5 model gives "Killed" or crashes**

Solution: These models require ~4GB RAM each. Make sure no other large applications are running. On Windows, check Task Manager to see available memory before indexing.

---

## What You Can Change

All tuneable settings are in `backend/config.py`:

- **`CHUNK_SIZE = 512`** — Size of text chunks in characters. Larger chunks give more context but slower indexing and retrieval. Try 256 for faster performance or 1024 for more context.
- **`CHUNK_OVERLAP = 50`** — Overlap between consecutive chunks. Helps maintain context across chunk boundaries.
- **`DEFAULT_TOP_K = 5`** — How many chunks to retrieve per query by default. The UI slider overrides this.
- **`GROQ_MODEL = "llama3-8b-8192"`** — Can change to `"mixtral-8x7b-32768"` for much longer context (32K tokens) or `"llama3-70b-8192"` for higher answer quality.
- **`GROQ_MAX_TOKENS = 512`** — Maximum length of generated answers. Increase to 1024 for longer, more detailed answers.
- **`MAX_FILE_SIZE_MB = 50`** — Maximum PDF file size. Increase if you have larger papers.

---

## Project Structure Explained

```
project/
├── frontend/                    All user interface files (served by FastAPI)
│   ├── index.html               Single HTML file containing all 4 pages
│   ├── css/
│   │   ├── main.css             Base styles, variables, layout, dark/light theme
│   │   ├── components.css       Sidebar, cards, answer cards, toasts, drop zone
│   │   └── animations.css       All CSS animations and transitions
│   └── js/
│       ├── app.js               Main controller — all page logic and event handlers
│       ├── api.js               All fetch() calls to the backend with error handling
│       ├── ui.js                Toast system, theme, navigation, drop zone helpers
│       ├── charts.js            All Chart.js visualizations
│       └── history.js           Query history panel
│
├── backend/
│   ├── main.py                  FastAPI app — mounts routes and serves frontend
│   ├── config.py                All constants: model names, paths, chunk sizes
│   ├── logger.py                Three rotating log handlers: app, errors, queries
│   ├── pipeline/
│   │   ├── pdf_parser.py        PyMuPDF text extraction, page by page
│   │   ├── chunker.py           LangChain RecursiveCharacterTextSplitter
│   │   ├── embedder.py          SentenceTransformer + FAISS index builder
│   │   └── retriever.py         FAISS similarity search, query prefix handling
│   ├── services/
│   │   ├── groq_service.py      Groq API client, retry logic, latency measurement
│   │   ├── evaluator.py         ROUGE + BERTScore calculation
│   │   └── report_gen.py        CSV export, query log parsing
│   ├── routes/
│   │   ├── upload.py            POST /api/upload
│   │   ├── documents.py         GET/DELETE /api/documents
│   │   ├── query.py             POST /api/query, POST /api/index, GET /api/health
│   │   └── evaluate.py          POST /api/evaluate, POST /api/batch
│   ├── data/
│   │   ├── papers/              Uploaded PDF files stored here
│   │   ├── vector_stores/       FAISS index files (.faiss) and chunk metadata (.pkl)
│   │   └── qa_dataset.json      Sample QA pairs for batch evaluation
│   └── logs/
│       ├── app.log              INFO-level application events
│       ├── errors.log           ERROR-level events with full tracebacks
│       └── queries.log          Every query logged with model, latency, scores
│
├── requirements.txt             All Python dependencies with pinned versions
├── .env.example                 Template for environment variables
└── README.md                    This file
```

---

## Credits and Tools Used

| Tool | Purpose | Link |
|------|---------|-------|
| FastAPI | Python web framework for the API | https://fastapi.tiangolo.com |
| Uvicorn | ASGI server to run FastAPI | https://www.uvicorn.org |
| PyMuPDF (fitz) | PDF text extraction | https://pymupdf.readthedocs.io |
| LangChain | RecursiveCharacterTextSplitter for chunking | https://langchain.com |
| sentence-transformers | Load and run HuggingFace embedding models | https://www.sbert.net |
| FAISS | Facebook AI Similarity Search vector store | https://faiss.ai |
| Groq API | Fast LLM inference (llama3-8b-8192) | https://console.groq.com |
| rouge-score | ROUGE-1 and ROUGE-L calculation | https://pypi.org/project/rouge-score |
| bert-score | BERTScore semantic similarity | https://github.com/Tiiiger/bert_score |
| Chart.js | All frontend charts and visualizations | https://www.chartjs.org |
| Inter Font | Typography | https://fonts.google.com/specimen/Inter |
| MiniLM-L6-v2 | Fast baseline embedding model | https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 |
| E5-Large-v2 | Instruction-tuned embedding model | https://huggingface.co/intfloat/e5-large-v2 |
| BGE-Large-v1.5 | BAAI top-accuracy embedding model | https://huggingface.co/BAAI/bge-large-en-v1.5 |
