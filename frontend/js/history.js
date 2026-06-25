/**
 * AcademicRAG — Query History Panel
 * Manages the sliding history panel with the last 10 questions.
 */

import { apiGetHistory } from './api.js';
import { showToast, escapeHtml } from './ui.js';

let historyOpen  = false;
let lastQuestion = null;
let onReloadCb   = null;

export function initHistoryPanel(onReload) {
  onReloadCb = onReload;

  const toggleBtn = document.getElementById('history-toggle-btn');
  const closeBtn  = document.getElementById('history-close-btn');
  const panel     = document.getElementById('history-panel');

  if (toggleBtn) toggleBtn.addEventListener('click', () => togglePanel());
  if (closeBtn)  closeBtn.addEventListener('click',  () => closePanel());
}

function togglePanel() {
  historyOpen ? closePanel() : openPanel();
}

function openPanel() {
  historyOpen = true;
  const panel = document.getElementById('history-panel');
  if (panel) panel.classList.add('open');
  loadHistory();
}

function closePanel() {
  historyOpen = false;
  const panel = document.getElementById('history-panel');
  if (panel) panel.classList.remove('open');
}

async function loadHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;

  list.innerHTML = '<div class="text-sm text-muted" style="padding:12px">Loading…</div>';

  try {
    const data = await apiGetHistory();
    const entries = data.history || [];

    if (!entries.length) {
      list.innerHTML = '<div class="text-sm text-muted" style="padding:12px">No queries yet.</div>';
      return;
    }

    // Show max 10 most recent
    const recent = entries.slice(0, 10);
    list.innerHTML = recent.map((e, i) => `
      <div class="history-item" data-question="${escapeHtml(e.question || '')}" data-idx="${i}">
        <div class="history-item-q">${escapeHtml(e.question || 'Unknown question')}</div>
        <div class="history-item-ts">
          ${e.timestamp || ''}
          ${e.model ? ` · ${e.model.toUpperCase()}` : ''}
          ${e.latency_s ? ` · ${parseFloat(e.latency_s).toFixed(2)}s` : ''}
        </div>
      </div>
    `).join('');

    // Click to reload question
    list.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const q = item.dataset.question;
        if (q && onReloadCb) {
          onReloadCb(q);
          closePanel();
          showToast(`Reloaded: "${q.slice(0, 60)}…"`, 'info');
        }
      });
    });

  } catch (err) {
    list.innerHTML = `<div class="text-sm text-error" style="padding:12px">Failed to load history: ${escapeHtml(err.message)}</div>`;
    showToast('Cannot load history: ' + err.message, 'error');
  }
}

export function addToHistory(question) {
  lastQuestion = question;
}
