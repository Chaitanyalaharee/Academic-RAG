/**
 * AcademicRAG — UI Utilities
 * Toast system, theme toggle, sidebar, drop zone, helpers.
 */

// ─── Toast ─────────────────────────────────────────────────
const TOAST_ICONS = {
  success: '✅',
  error:   '❌',
  warning: '⚠️',
  info:    'ℹ️',
};

export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || 'ℹ️'}</span>
    <span class="toast-body">${message}</span>
    <span class="toast-close" onclick="this.closest('.toast').remove()">✕</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// ─── Theme Toggle ─────────────────────────────────────────
export function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    document.body.classList.add('light-mode');
    btn.textContent = '☀️';
  }
  btn.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-mode');
    btn.textContent = isLight ? '☀️' : '🌙';
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  });
}

// ─── Sidebar ──────────────────────────────────────────────
export function initSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const content  = document.getElementById('main-content');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');

  let collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
  const apply = () => {
    sidebar.classList.toggle('collapsed', collapsed);
    content.classList.toggle('sidebar-collapsed', collapsed);
  };
  apply();

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      localStorage.setItem('sidebar-collapsed', collapsed);
      apply();
    });
  }
}

// ─── Page Navigation ──────────────────────────────────────
export function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const pages    = document.querySelectorAll('.page');

  function activatePage(pageId) {
    pages.forEach(p => p.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));

    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');

    const navItem = document.querySelector(`[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');

    localStorage.setItem('current-page', pageId);
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      activatePage(item.dataset.page);
    });
  });

  // Restore last page
  const last = localStorage.getItem('current-page') || 'page-dashboard';
  activatePage(last);
}

// ─── Offline banner ────────────────────────────────────────
export function setOffline(isOffline) {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.classList.toggle('visible', isOffline);
}

// ─── Server health polling ─────────────────────────────────
export function startHealthPolling(checkFn, intervalMs = 10000) {
  const check = async () => {
    try {
      await checkFn();
      setOffline(false);
    } catch {
      setOffline(true);
    }
  };
  check();
  return setInterval(check, intervalMs);
}

// ─── Drop zone ─────────────────────────────────────────────
export function initDropZone(dropZoneId, fileInputId, onFiles) {
  const zone  = document.getElementById(dropZoneId);
  const input = document.getElementById(fileInputId);
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length) onFiles(files);
    else showToast('Only PDF files are allowed', 'warning');
  });

  input.addEventListener('change', () => {
    const files = Array.from(input.files);
    if (files.length) onFiles(files);
    input.value = '';
  });
}

// ─── Skeleton helpers ──────────────────────────────────────
export function showSkeleton(containerId, rows = 3, height = '20px') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = Array.from({ length: rows }, () =>
    `<div class="skeleton" style="height:${height};margin-bottom:10px;border-radius:6px;"></div>`
  ).join('');
}

export function clearSkeleton(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '';
}

// ─── Format helpers ────────────────────────────────────────
export function fmtSeconds(s) {
  return typeof s === 'number' ? s.toFixed(3) + 's' : '—';
}

export function fmtScore(s) {
  return typeof s === 'number' ? (s * 100).toFixed(1) + '%' : '—';
}

export function heatClass(score) {
  if (score >= 0.80) return 'heat-green';
  if (score >= 0.60) return 'heat-yellow';
  return 'heat-red';
}

export function heatEmoji(score) {
  if (score >= 0.80) return '🟩';
  if (score >= 0.60) return '🟨';
  return '🟥';
}

// ─── Progress bar update ───────────────────────────────────
export function setProgress(barId, pct, labelId = null, labelText = '') {
  const bar = document.getElementById(barId);
  if (bar) bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  if (labelId) {
    const lbl = document.getElementById(labelId);
    if (lbl) lbl.textContent = labelText;
  }
}

// ─── Collapsible toggle ────────────────────────────────────
export function toggleCollapsible(contentEl, arrowEl) {
  const isOpen = contentEl.classList.toggle('open');
  if (arrowEl) arrowEl.textContent = isOpen ? '▲' : '▼';
}

// ─── File size formatter ───────────────────────────────────
export function fmtFileSize(kb) {
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

// ─── Query string escape ───────────────────────────────────
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Confirmation dialog ───────────────────────────────────
export function confirmDialog(message) {
  return window.confirm(message);
}
