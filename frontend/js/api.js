/**
 * AcademicRAG — API Client
 */

const BASE_URL = 'http://127.0.0.1:8000';
const TIMEOUT_MS = 60_000;

async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(BASE_URL + path, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    clearTimeout(timer);

    if (!res.ok) {
      let errData;
      try {
        errData = await res.json();
      } catch {
        throw new Error(`Server error ${res.status}`);
      }
      throw new Error(errData.error || errData.detail || `Server error ${res.status}`);
    }

    return await res.json();

  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Request timed out');
    if (err.message === 'Failed to fetch') throw new Error('Cannot connect to server');
    throw err;
  }
}

// ─── Health ───
export async function apiHealth() {
  return apiFetch('/api/health', { method: 'GET' });
}

// ─── Upload ───
export async function apiUpload(files) {
  const form = new FormData();
  for (const f of files) form.append('files', f);

  const res = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

// ─── Documents ───
export async function apiGetDocuments() {
  return apiFetch('/api/documents', { method: 'GET' });
}

export async function apiDeleteDocument(filename) {
  return apiFetch(`/api/documents/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
}

// ─── Index ───
export async function apiGetIndexStatus() {
  return apiFetch('/api/index/status', { method: 'GET' });
}

export function apiBuildIndex(onEvent, onError) {
  const controller = new AbortController();

  fetch(`${BASE_URL}/api/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      onError('Index build failed');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            onEvent(JSON.parse(line.slice(6)));
          } catch {}
        }
      }
    }
  }).catch(err => onError(err.message));

  return controller;
}

// ─── Query ───
export async function apiQuery(question, topK = 5) {
  return apiFetch('/api/query', {
    method: 'POST',
    body: JSON.stringify({ question, top_k: topK }),
  });
}

// ─── Evaluate ───
export async function apiEvaluate(predicted, groundTruth) {
  return apiFetch('/api/evaluate', {
    method: 'POST',
    body: JSON.stringify({ predicted, ground_truth: groundTruth }),
  });
}

// ─── Batch ───
export function apiBatchEvaluate(qaPairs, topK, onEvent, onError) {
  const controller = new AbortController();

  fetch(`${BASE_URL}/api/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qa_pairs: qaPairs, top_k: topK }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      onError('Batch failed');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            onEvent(JSON.parse(line.slice(6)));
          } catch {}
        }
      }
    }
  }).catch(err => onError(err.message));

  return controller;
}

// ─── History ───
export async function apiGetHistory() {
  return apiFetch('/api/history', { method: 'GET' });
}

// ─── Export ───
export function apiExportCSV() {
  window.open(`${BASE_URL}/api/export`, '_blank');
}