/**
 * AcademicRAG — Main Application Controller
 * Orchestrates all four pages: Dashboard, Documents, Query, Batch.
 */

import {
  apiHealth, apiUpload, apiGetDocuments, apiDeleteDocument,
  apiGetIndexStatus, apiBuildIndex, apiQuery,
  apiEvaluate, apiBatchEvaluate, apiGetHistory, apiExportCSV,
} from './api.js';

import {
  showToast, initThemeToggle, initSidebar, initNavigation,
  setOffline, startHealthPolling, initDropZone,
  showSkeleton, fmtSeconds, fmtScore, heatClass, heatEmoji,
  setProgress, toggleCollapsible, fmtFileSize, escapeHtml, confirmDialog,
} from './ui.js';

import {
  renderGroupedBarChart, renderBubbleChart,
  renderRadarChart, renderLineChart,
} from './charts.js';

import { initHistoryPanel } from './history.js';

// ─── App State ─────────────────────────────────────────────
const state = {
  lastQueryResults: null,
  lastScores:       null,
  indexStatus:      { minilm: false, e5: false, bge: false },
  documents:        [],
  batchResults:     null,
  batchController:  null,
  indexController:  null,
};

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  initSidebar();
  initNavigation();
  initThemeToggle();
  initParticles();

  initHistoryPanel((q) => {
    // Reload a question from history
    const qInput = document.getElementById('query-input');
    if (qInput) qInput.value = q;
    document.querySelector('[data-page="page-query"]')?.click();
  });

  startHealthPolling(async () => {
    const data = await apiHealth();
    updateDashboardStats(data);
    state.indexStatus = data.index_status || state.indexStatus;
    updateIndexStatusDisplay();
  });

  initDocumentsPage();
  initQueryPage();
  initBatchPage();

  // Initial index status load
  try {
    const st = await apiGetIndexStatus();
    state.indexStatus = st;
    updateIndexStatusDisplay();
  } catch { /* handled by health polling */ }
});

// ──────────────────────────────────────────────────────────
// PARTICLES
// ──────────────────────────────────────────────────────────
function initParticles() {
  const container = document.getElementById('particles-container');
  if (!container) return;
  const colors = ['#00d4ff', '#a855f7', '#f59e0b'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      bottom: 0;
      background: ${colors[i % 3]};
      animation-duration: ${6 + Math.random() * 8}s;
      animation-delay: ${Math.random() * 6}s;
      width: ${2 + Math.random() * 4}px;
      height: ${2 + Math.random() * 4}px;
    `;
    container.appendChild(p);
  }
}

// ──────────────────────────────────────────────────────────
// DASHBOARD STATS
// ──────────────────────────────────────────────────────────
function updateDashboardStats(data) {
  const el = (id) => document.getElementById(id);
  if (el('stat-papers')) el('stat-papers').textContent = data.papers_count ?? '—';
  const built = Object.values(data.index_status || {}).filter(Boolean).length;
  if (el('stat-indexes')) el('stat-indexes').textContent = built + '/3';
}

function updateIndexStatusDisplay() {
  const models = ['minilm', 'e5', 'bge'];
  models.forEach(m => {
    const el = document.getElementById(`status-${m}`);
    if (!el) return;
    const ready = state.indexStatus[m];
    el.textContent = ready ? 'Ready ✅' : 'Not Built ❌';
    el.className = `status-indicator ${ready ? 'ready' : 'not-built'}`;
  });
}

// ══════════════════════════════════════════════════════════
// DOCUMENTS PAGE
// ══════════════════════════════════════════════════════════
function initDocumentsPage() {
  initDropZone('drop-zone', 'file-input', handleFileUpload);

  document.getElementById('build-index-btn')?.addEventListener('click', handleBuildIndex);
  document.getElementById('refresh-docs-btn')?.addEventListener('click', loadDocuments);

  loadDocuments();
}

async function loadDocuments() {
  const list = document.getElementById('documents-list');
  if (!list) return;

  list.innerHTML = `
    <tr><td colspan="4"><div class="skeleton" style="height:20px;"></div></td></tr>
    <tr><td colspan="4"><div class="skeleton" style="height:20px;margin-top:8px;"></div></td></tr>
  `;

  try {
    const data = await apiGetDocuments();
    state.documents = data.documents || [];
    renderDocumentsList(state.documents);
  } catch (err) {
    list.innerHTML = `<tr><td colspan="4" class="text-error">Failed to load: ${escapeHtml(err.message)}</td></tr>`;
    showToast('Cannot connect to server', 'error');
  }
}

function renderDocumentsList(docs) {
  const list = document.getElementById('documents-list');
  if (!list) return;

  if (!docs.length) {
    list.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">No documents uploaded yet.</td></tr>`;
    return;
  }

  list.innerHTML = docs.map(d => `
    <tr>
      <td>📄 ${escapeHtml(d.filename)}</td>
      <td>${fmtFileSize(d.size_kb)}</td>
      <td>${d.upload_date}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteDoc('${escapeHtml(d.filename)}')">
          🗑 Delete
        </button>
      </td>
    </tr>
  `).join('');
}

window.deleteDoc = async function(filename) {
  if (!confirmDialog(`Delete "${filename}"?`)) return;
  try {
    await apiDeleteDocument(filename);
    showToast(`"${filename}" deleted`, 'success');
    loadDocuments();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

async function handleFileUpload(files) {
  const MAX_MB = 50;
  const valid = files.filter(f => {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      showToast(`"${f.name}" is not a PDF`, 'warning');
      return false;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      showToast(`"${f.name}" exceeds ${MAX_MB}MB limit`, 'warning');
      return false;
    }
    return true;
  });
  if (!valid.length) return;

  const zone = document.getElementById('drop-zone');
  if (zone) zone.innerHTML = `<div class="spinner"></div><p style="margin-top:12px;">Uploading ${valid.length} file(s)…</p>`;

  try {
    const data = await apiUpload(valid);
    const results = data.results || [];
    const ok  = results.filter(r => r.success).length;
    const bad = results.filter(r => !r.success);
    if (ok)  showToast(`${ok} file(s) uploaded successfully`, 'success');
    bad.forEach(r => showToast(`"${r.filename}": ${r.error}`, 'error'));
    loadDocuments();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    const zone = document.getElementById('drop-zone');
    if (zone) {
      zone.innerHTML = `
        <div class="drop-icon">📤</div>
        <div class="drop-title">Drag & drop PDF files here</div>
        <div class="drop-sub">or click to browse — PDF only, max 50MB each</div>
      `;
    }
  }
}

function handleBuildIndex() {
  const section = document.getElementById('index-progress-section');
  if (section) section.style.display = 'block';

  const models = ['minilm', 'e5', 'bge'];

  // Reset all bars
  models.forEach(m => {
    setProgress(`progress-bar-${m}`, 0);
    const statusEl = document.getElementById(`index-status-${m}`);
    if (statusEl) statusEl.textContent = 'Waiting…';
  });

  if (state.documents.length === 0) {
    showToast('Please upload PDF files before building the index', 'warning');
    return;
  }

  const btn = document.getElementById('build-index-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Building…'; }

  state.indexController = apiBuildIndex(
    (data) => {
      const model = data.model;
      const pct   = data.progress || 0;
      const msg   = data.status   || '';

      if (model === 'system') {
        models.forEach(m => {
          if (pct === 100) setProgress(`progress-bar-${m}`, 100);
        });
      } else if (models.includes(model)) {
        setProgress(`progress-bar-${model}`, pct);
        const statusEl = document.getElementById(`index-status-${model}`);
        if (statusEl) statusEl.textContent = msg;
      }

      if (data.complete) {
        showToast(`All indexes built in ${data.time_taken}s`, 'success');
        if (btn) { btn.disabled = false; btn.textContent = '🔨 Build Index for All Models'; }
        // Refresh status
        apiGetIndexStatus().then(st => {
          state.indexStatus = st;
          updateIndexStatusDisplay();
        }).catch(() => {});
      }
      if (data.error) {
        showToast(msg, 'error');
      }
    },
    (err) => {
      showToast('Index build failed: ' + err, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '🔨 Build Index for All Models'; }
    }
  );
}

// ══════════════════════════════════════════════════════════
// QUERY PAGE
// ══════════════════════════════════════════════════════════
function initQueryPage() {
  const queryBtn  = document.getElementById('run-query-btn');
  const topkSlider = document.getElementById('topk-slider');
  const topkVal    = document.getElementById('topk-value');
  const evalBtn    = document.getElementById('calc-scores-btn');
  const exportBtn  = document.getElementById('export-csv-btn');

  if (topkSlider && topkVal) {
    topkSlider.addEventListener('input', () => topkVal.textContent = topkSlider.value);
  }

  if (queryBtn)  queryBtn.addEventListener('click', handleQuery);
  if (evalBtn)   evalBtn.addEventListener('click',  handleEvaluate);
  if (exportBtn) exportBtn.addEventListener('click', apiExportCSV);

  // Allow Enter key in query input
  document.getElementById('query-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleQuery(); }
  });
}

async function handleQuery() {
  const input  = document.getElementById('query-input');
  const topk   = document.getElementById('topk-slider');
  const question = input?.value.trim();

  if (!question) { showToast('Please enter a question', 'warning'); return; }

  const any = Object.values(state.indexStatus).some(Boolean);
  if (!any) { showToast('Please build the index before querying', 'warning'); return; }

  setQueryLoading(true);
  resetQueryResults();

  try {
    const data = await apiQuery(question, topk ? +topk.value : 5);
    state.lastQueryResults = data;
    renderQueryResults(data);
    showToast('Results loaded', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setQueryLoading(false);
  }
}

function setQueryLoading(on) {
  const btn = document.getElementById('run-query-btn');
  if (!btn) return;
  if (on) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Searching…';
    startRaceAnimation();
  } else {
    btn.disabled = false;
    btn.innerHTML = '🔍 Search All Models';
    stopRaceAnimation();
  }
}

// Simple timer-based race bar animation while loading
let _raceTimer = null;
let _raceTimes = { minilm: 0, e5: 0, bge: 0 };

function startRaceAnimation() {
  const models = ['minilm', 'e5', 'bge'];
  _raceTimes = { minilm: 0, e5: 0, bge: 0 };

  const section = document.getElementById('race-section');
  if (section) section.style.display = 'block';

  models.forEach(m => {
    setProgress(`race-bar-${m}`, 5);
    const el = document.getElementById(`race-status-${m}`);
    if (el) el.textContent = 'Running…';
    const row = document.getElementById(`race-row-${m}`);
    if (row) row.classList.add('race-running');
  });

  _raceTimer = setInterval(() => {
    models.forEach(m => {
      _raceTimes[m] = (_raceTimes[m] || 0) + 0.1;
      const el = document.getElementById(`race-status-${m}`);
      if (el && el.textContent !== 'Done ✅') {
        el.textContent = `Running… ${_raceTimes[m].toFixed(1)}s`;
      }
    });
  }, 100);
}

function stopRaceAnimation() {
  clearInterval(_raceTimer);
}

function resetQueryResults() {
  ['minilm', 'e5', 'bge'].forEach(m => {
    const card = document.getElementById(`answer-card-${m}`);
    if (card) card.innerHTML = `
      <div class="skeleton" style="height:18px;margin-bottom:8px;"></div>
      <div class="skeleton" style="height:18px;margin-bottom:8px;width:80%;"></div>
      <div class="skeleton" style="height:18px;width:60%;"></div>
    `;
  });
}

function renderQueryResults(data) {
  const results = data.results || {};
  const models  = ['minilm', 'e5', 'bge'];

  // Find fastest
  const latencies = {};
  models.forEach(m => {
    if (results[m]?.success) latencies[m] = results[m].total_latency;
  });
  const fastest = Object.keys(latencies).sort((a,b) => latencies[a]-latencies[b])[0];

  models.forEach(m => {
    const res  = results[m];
    const card = document.getElementById(`answer-card-${m}`);
    if (!card) return;

    // Update race bar
    const raceStatus = document.getElementById(`race-status-${m}`);
    const row = document.getElementById(`race-row-${m}`);
    if (row) row.classList.remove('race-running');

    if (!res || !res.success) {
      card.innerHTML = `<div class="text-error p-16">${escapeHtml(res?.error || 'Failed')}</div>`;
      if (raceStatus) raceStatus.textContent = 'Error';
      return;
    }

    const pct  = (res.total_latency / 5) * 100; // max 5s = 100%
    setProgress(`race-bar-${m}`, Math.min(pct, 100));
    if (raceStatus) raceStatus.textContent = `✅ Done ${res.total_latency.toFixed(2)}s`;

    const chunks = res.chunks || [];
    const chunksHtml = chunks.map((c, i) => `
      <div class="chunk-item">
        <div class="chunk-meta">
          <span class="chunk-source">📄 ${escapeHtml(c.source_file)} · Page ${c.page_number}</span>
          <span class="badge badge-info">Chunk #${c.chunk_id}</span>
          <span class="${heatClass(c.similarity_score)}">${heatEmoji(c.similarity_score)} ${c.similarity_score.toFixed(3)}</span>
        </div>
        <div class="chunk-text">${escapeHtml((c.text || '').slice(0, 240))}…</div>
      </div>
    `).join('');

    const avgSim = res.avg_similarity || 0;

    card.innerHTML = `
      <div class="answer-text">${escapeHtml(res.answer || '')}</div>
      <div class="answer-stats">
        <div class="answer-stat">
          <div class="answer-stat-value">${fmtSeconds(res.total_latency)}</div>
          <div class="answer-stat-label">Total Latency</div>
        </div>
        <div class="answer-stat">
          <div class="answer-stat-value">${fmtSeconds(res.retrieval_latency)}</div>
          <div class="answer-stat-label">Retrieval</div>
        </div>
        <div class="answer-stat">
          <div class="answer-stat-value">${res.chunk_count}</div>
          <div class="answer-stat-label">Chunks</div>
        </div>
        ${m === fastest ? '<div class="badge badge-success">⚡ Fastest</div>' : ''}
      </div>
      <div class="sim-bar-wrap mt-12">
        <span>Avg Similarity</span>
        <div class="progress-wrap">
          <div class="progress-bar ${m}" style="width:${(avgSim*100).toFixed(1)}%"></div>
        </div>
        <span>${avgSim.toFixed(3)}</span>
      </div>
      <button class="chunks-toggle" onclick="toggleChunks(this)">
        📋 View Retrieved Chunks (${chunks.length}) <span>▼</span>
      </button>
      <div class="chunks-content">
        ${chunksHtml}
      </div>
    `;
  });

  renderHeatmap(results);
  renderVerdictCard(results);
  state.lastQueryResults = data;
}

window.toggleChunks = function(btn) {
  const content = btn.nextElementSibling;
  const arrow   = btn.querySelector('span');
  if (content) toggleCollapsible(content, arrow);
};

function renderHeatmap(results) {
  const tbody = document.getElementById('heatmap-tbody');
  if (!tbody) return;

  const models  = ['minilm', 'e5', 'bge'];
  const maxChunks = Math.max(...models.map(m =>
    (results[m]?.chunks || []).length
  ));

  if (!maxChunks) { tbody.innerHTML = '<tr><td colspan="4" class="text-muted">No data</td></tr>'; return; }

  let html = '';
  for (let i = 0; i < maxChunks; i++) {
    html += '<tr>';
    html += `<td>Chunk ${i + 1}</td>`;
    models.forEach(m => {
      const chunk = (results[m]?.chunks || [])[i];
      if (chunk) {
        const s = chunk.similarity_score;
        html += `<td class="${heatClass(s)}">${heatEmoji(s)} ${s.toFixed(3)}</td>`;
      } else {
        html += '<td class="text-muted">—</td>';
      }
    });
    html += '</tr>';
  }
  tbody.innerHTML = html;
}

async function handleEvaluate() {
  const gt = document.getElementById('ground-truth-input')?.value.trim();
  if (!gt) { showToast('Please enter the ground truth answer', 'warning'); return; }
  if (!state.lastQueryResults) { showToast('Run a query first', 'warning'); return; }

  const results = state.lastQueryResults.results || {};
  const predicted = {};
  ['minilm', 'e5', 'bge'].forEach(m => {
    if (results[m]?.answer) predicted[m] = results[m].answer;
  });

  if (!Object.keys(predicted).length) {
    showToast('No answers to evaluate', 'warning');
    return;
  }

  const btn = document.getElementById('calc-scores-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Calculating…'; }

  try {
    const data = await apiEvaluate(predicted, gt);
    state.lastScores = data.scores;
    renderEvalResults(data.scores, results);
    showToast('Scores calculated', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📊 Calculate Accuracy Scores'; }
  }
}

function renderEvalResults(scores, queryResults) {
  const tbody = document.getElementById('eval-scores-tbody');
  if (!tbody) return;

  const models = ['minilm', 'e5', 'bge'];
  const labels = { minilm: 'MiniLM', e5: 'E5-Large', bge: 'BGE-Large' };

  tbody.innerHTML = models.map(m => {
    const sc  = scores[m] || {};
    const lat = queryResults[m]?.total_latency;
    const win = sc.win ? '🏆' : '';
    return `
      <tr>
        <td><span class="badge badge-${m}">${labels[m]}</span> ${win}</td>
        <td>${fmtScore(sc.rouge1)}</td>
        <td>${fmtScore(sc.rougeL)}</td>
        <td>${fmtScore(sc.bertscore)}</td>
        <td>${fmtSeconds(lat)}</td>
      </tr>
    `;
  }).join('');

  // Charts
  renderGroupedBarChart('accuracy-chart', scores);

  // Build bubble data
  const bubbleData = {};
  models.forEach(m => {
    const sc = scores[m] || {};
    bubbleData[m] = {
      latency:       queryResults[m]?.total_latency    || 0,
      bertscore:     sc.bertscore                      || 0,
      avg_similarity: queryResults[m]?.avg_similarity  || 0,
    };
  });
  renderBubbleChart('bubble-chart', bubbleData);

  // Verdict
  renderVerdictCard(queryResults, scores);

  // Show eval section
  const section = document.getElementById('eval-section');
  if (section) section.style.display = 'block';
}

function renderVerdictCard(queryResults, scores = null) {
  const card = document.getElementById('verdict-card');
  if (!card) return;

  const models  = ['minilm', 'e5', 'bge'];
  const labels  = { minilm: 'MiniLM', e5: 'E5-Large', bge: 'BGE-Large' };

  // Best speed
  const latencies = {};
  models.forEach(m => { if (queryResults[m]?.success) latencies[m] = queryResults[m].total_latency; });
  const fastest = Object.keys(latencies).sort((a,b) => latencies[a]-latencies[b])[0];

  // Best accuracy
  let bestAcc = null;
  if (scores) {
    bestAcc = models.slice().sort((a,b) =>
      (scores[b]?.bertscore||0) - (scores[a]?.bertscore||0)
    )[0];
  }

  // Balance = middle ground
  const balance = scores ? 'e5' : null;

  const speedLine  = fastest  ? `⚡ Best Speed → ${labels[fastest]} (${(latencies[fastest]||0).toFixed(2)}s)` : '⚡ Best Speed → Run a query';
  const balanceLine= balance  ? `⚖ Best Balance → ${labels[balance]}` : '⚖ Best Balance → Run evaluation';
  const accLine    = bestAcc && scores ? `🎯 Best Accuracy → ${labels[bestAcc]} (${(scores[bestAcc]?.bertscore||0).toFixed(2)} BS)` : '🎯 Best Accuracy → Run evaluation';
  const rec        = bestAcc ? labels[bestAcc] : 'E5-Large';
  const recReason  = bestAcc === 'bge' ? 'highest BERTScore — best for quality-critical tasks'
                   : bestAcc === 'e5'  ? 'best speed-accuracy balance for most use cases'
                                       : 'fastest retrieval — best for high-volume queries';

  card.innerHTML = `
    <div class="verdict-title">🏆 COMPARISON VERDICT</div>
    <div class="verdict-row">
      <span class="verdict-icon">⚡</span>
      <span class="verdict-label">Best Speed</span>
      <span class="verdict-value">${fastest ? labels[fastest] + ' · ' + (latencies[fastest]||0).toFixed(3)+'s' : '—'}</span>
    </div>
    <div class="verdict-row">
      <span class="verdict-icon">⚖</span>
      <span class="verdict-label">Best Balance</span>
      <span class="verdict-value">${labels['e5']}</span>
    </div>
    <div class="verdict-row">
      <span class="verdict-icon">🎯</span>
      <span class="verdict-label">Best Accuracy</span>
      <span class="verdict-value">${bestAcc && scores ? labels[bestAcc] + ' · ' + (scores[bestAcc]?.bertscore||0).toFixed(3) + ' BS' : '—'}</span>
    </div>
    <div class="verdict-row">
      <span class="verdict-icon">💡</span>
      <span class="verdict-label">Recommended</span>
      <span class="verdict-value">${rec} — ${recReason}</span>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════
// BATCH PAGE
// ══════════════════════════════════════════════════════════
function initBatchPage() {
  const uploadBtn = document.getElementById('batch-upload-btn');
  const fileInput = document.getElementById('batch-file-input');
  const runBtn    = document.getElementById('run-batch-btn');
  const exportBtn = document.getElementById('batch-export-btn');

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleBatchFileLoad);
  }
  if (runBtn)    runBtn.addEventListener('click', handleBatchRun);
  if (exportBtn) exportBtn.addEventListener('click', handleBatchExport);
}

let _batchQAPairs = [];

function handleBatchFileLoad() {
  const file = document.getElementById('batch-file-input')?.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const pairs = JSON.parse(e.target.result);
      if (!Array.isArray(pairs)) throw new Error('Expected a JSON array');
      _batchQAPairs = pairs;
      document.getElementById('batch-status').textContent =
        `✅ Loaded ${pairs.length} question-answer pairs`;
      showToast(`Loaded ${pairs.length} QA pairs`, 'success');
    } catch (err) {
      showToast('Invalid JSON file: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

function handleBatchRun() {
  if (!_batchQAPairs.length) {
    showToast('Load a QA JSON file first', 'warning');
    return;
  }
  const any = Object.values(state.indexStatus).some(Boolean);
  if (!any) {
    showToast('Please build the index before batch evaluation', 'warning');
    return;
  }

  const btn = document.getElementById('run-batch-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Running…'; }

  const progress = document.getElementById('batch-progress-text');
  const progressBar = document.getElementById('batch-progress-bar');

  state.batchController = apiBatchEvaluate(
    _batchQAPairs,
    5,
    (data) => {
      if (data.type === 'progress') {
        const pct = Math.round((data.current / data.total) * 100);
        if (progress) progress.textContent = `Running question ${data.current} of ${data.total}… "${(data.question||'').slice(0,60)}"`;
        setProgress('batch-progress-bar', pct);
      }
      if (data.type === 'complete') {
        state.batchResults = data;
        renderBatchResults(data);
        if (btn) { btn.disabled = false; btn.textContent = '▶ Run Batch Evaluation'; }
        if (progress) progress.textContent = `✅ Completed ${_batchQAPairs.length} questions!`;
        setProgress('batch-progress-bar', 100);
        showToast('Batch evaluation complete!', 'success');
      }
    },
    (err) => {
      showToast('Batch failed: ' + err, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '▶ Run Batch Evaluation'; }
    }
  );
}

function renderBatchResults(data) {
  const avgs   = data.averages || {};
  const results = data.results || [];
  const models  = ['minilm', 'e5', 'bge'];
  const labels  = { minilm: 'MiniLM', e5: 'E5-Large', bge: 'BGE-Large' };

  // Summary table
  const metrics = ['avg_rouge1', 'avg_rougeL', 'avg_bertscore', 'avg_latency', 'win_pct'];
  const metricLabels = ['Avg ROUGE-1', 'Avg ROUGE-L', 'Avg BERTScore', 'Avg Latency', 'Win Count'];

  const tbody = document.getElementById('batch-summary-tbody');
  if (tbody) {
    tbody.innerHTML = metricLabels.map((label, i) => {
      const key = metrics[i];
      const isLatency = key === 'avg_latency';
      const isWin     = key === 'win_pct';

      const best = isLatency
        ? models.reduce((a, b) => (avgs[a]?.[key]||9999) < (avgs[b]?.[key]||9999) ? a : b)
        : models.reduce((a, b) => (avgs[a]?.[key]||0) > (avgs[b]?.[key]||0) ? a : b);

      return `<tr>
        <td>${label}</td>
        ${models.map(m => {
          const val  = avgs[m]?.[key] ?? '—';
          const isBest = m === best;
          let display = typeof val === 'number'
            ? (isLatency ? val.toFixed(3)+'s' : (isWin ? val : fmtScore(val)))
            : val;
          return `<td ${isBest ? 'class="text-success font-bold"' : ''}>${display} ${isBest ? '🏆' : ''}</td>`;
        }).join('')}
      </tr>`;
    }).join('');
  }

  // Radar chart — compute normalised scores
  const radarData = {};
  models.forEach(m => {
    const a = avgs[m] || {};
    radarData[m] = [
      a.avg_bertscore || 0,                    // Accuracy
      1 - Math.min(1, (a.avg_latency||0) / 3), // Speed (inverted latency)
      a.avg_rouge1    || 0,                    // Retrieval Quality
      a.avg_rougeL    || 0,                    // Consistency
      a.avg_bertscore ? a.avg_bertscore * 0.9 : 0, // Chunk Relevance (proxy)
    ];
  });
  renderRadarChart('radar-chart', radarData);
  renderLineChart('line-chart', results);

  // Show results section
  const section = document.getElementById('batch-results-section');
  if (section) section.style.display = 'block';
}

function handleBatchExport() {
  if (!state.batchResults) {
    showToast('Run batch evaluation first', 'warning');
    return;
  }
  const csv = state.batchResults.csv || '';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'batch_evaluation.csv';
  a.click();
  URL.revokeObjectURL(url);
}
