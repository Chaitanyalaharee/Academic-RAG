/**
 * AcademicRAG — Charts
 * All Chart.js visualizations: grouped bar, bubble, radar, line.
 */

const MODEL_COLORS = {
  minilm: { main: '#00d4ff', bg: 'rgba(0,212,255,0.2)',  border: '#00d4ff' },
  e5:     { main: '#a855f7', bg: 'rgba(168,85,247,0.2)', border: '#a855f7' },
  bge:    { main: '#f59e0b', bg: 'rgba(245,158,11,0.2)', border: '#f59e0b' },
};

const METRIC_COLORS = {
  rouge1:    { bg: 'rgba(16,185,129,0.7)',  border: '#10b981' },
  rougeL:    { bg: 'rgba(59,130,246,0.7)',  border: '#3b82f6' },
  bertscore: { bg: 'rgba(168,85,247,0.7)',  border: '#a855f7' },
};

const CHART_TEXT_COLOR = '#94a3b8';
const GRID_COLOR       = 'rgba(255,255,255,0.06)';

// Chart instances keyed by canvas id
const _charts = {};

function destroyChart(id) {
  if (_charts[id]) {
    _charts[id].destroy();
    delete _charts[id];
  }
}

function defaultChartOptions(title = '') {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: CHART_TEXT_COLOR, font: { family: 'Inter', size: 12 } } },
      title:  title
        ? { display: true, text: title, color: CHART_TEXT_COLOR, font: { size: 13, weight: '700', family: 'Inter' } }
        : { display: false },
      tooltip: {
        backgroundColor: 'rgba(17,24,39,0.95)',
        titleColor: '#f1f5f9',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        ticks: { color: CHART_TEXT_COLOR, font: { family: 'Inter', size: 11 } },
        grid:  { color: GRID_COLOR },
      },
      y: {
        ticks: { color: CHART_TEXT_COLOR, font: { family: 'Inter', size: 11 } },
        grid:  { color: GRID_COLOR },
      },
    },
  };
}

// ─── Grouped Bar Chart (accuracy metrics per model) ────────
export function renderGroupedBarChart(canvasId, scores) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const models  = Object.keys(scores);
  const labels  = models.map(m => ({ minilm: 'MiniLM', e5: 'E5-Large', bge: 'BGE-Large' }[m] || m));

  const datasets = [
    {
      label: 'ROUGE-1',
      data: models.map(m => +(scores[m]?.rouge1 || 0).toFixed(4)),
      backgroundColor: METRIC_COLORS.rouge1.bg,
      borderColor:     METRIC_COLORS.rouge1.border,
      borderWidth: 2,
      borderRadius: 4,
    },
    {
      label: 'ROUGE-L',
      data: models.map(m => +(scores[m]?.rougeL || 0).toFixed(4)),
      backgroundColor: METRIC_COLORS.rougeL.bg,
      borderColor:     METRIC_COLORS.rougeL.border,
      borderWidth: 2,
      borderRadius: 4,
    },
    {
      label: 'BERTScore',
      data: models.map(m => +(scores[m]?.bertscore || 0).toFixed(4)),
      backgroundColor: METRIC_COLORS.bertscore.bg,
      borderColor:     METRIC_COLORS.bertscore.border,
      borderWidth: 2,
      borderRadius: 4,
    },
  ];

  const opts = defaultChartOptions('Accuracy Metrics Comparison');
  opts.scales.y.min  = 0;
  opts.scales.y.max  = 1;
  opts.scales.y.ticks.callback = v => (v * 100).toFixed(0) + '%';

  _charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: opts,
  });
}

// ─── Bubble Chart (speed vs accuracy) ─────────────────────
export function renderBubbleChart(canvasId, modelData) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const datasets = Object.entries(modelData).map(([key, d]) => ({
    label: { minilm: 'MiniLM', e5: 'E5-Large', bge: 'BGE-Large' }[key] || key,
    data: [{
      x: d.latency    || 0,
      y: d.bertscore  || 0,
      r: Math.max(6, (d.avg_similarity || 0.5) * 22),
    }],
    backgroundColor: MODEL_COLORS[key]?.bg   || 'rgba(255,255,255,0.2)',
    borderColor:     MODEL_COLORS[key]?.main  || '#fff',
    borderWidth: 2,
  }));

  const opts = defaultChartOptions('Speed vs Accuracy Tradeoff');
  opts.scales.x.title = { display: true, text: 'Latency (seconds)', color: CHART_TEXT_COLOR };
  opts.scales.y.title = { display: true, text: 'BERTScore', color: CHART_TEXT_COLOR };
  opts.scales.y.min   = 0;
  opts.scales.y.max   = 1;
  opts.plugins.tooltip.callbacks = {
    label: (ctx) => {
      const { x, y, r } = ctx.raw;
      return [
        `Model: ${ctx.dataset.label}`,
        `Latency: ${x.toFixed(3)}s`,
        `BERTScore: ${(y * 100).toFixed(1)}%`,
        `Avg Similarity: ${(r / 22).toFixed(2)}`,
      ];
    },
  };

  _charts[canvasId] = new Chart(canvas, {
    type: 'bubble',
    data: { datasets },
    options: opts,
  });
}

// ─── Radar Chart (batch evaluation profile) ───────────────
export function renderRadarChart(canvasId, radarData) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const axes = ['Accuracy', 'Speed', 'Retrieval Quality', 'Consistency', 'Chunk Relevance'];
  const models = Object.keys(radarData);

  const datasets = models.map(key => ({
    label: { minilm: 'MiniLM', e5: 'E5-Large', bge: 'BGE-Large' }[key] || key,
    data:  axes.map((_, i) => radarData[key][i] || 0),
    backgroundColor: MODEL_COLORS[key]?.bg   || 'rgba(255,255,255,0.1)',
    borderColor:     MODEL_COLORS[key]?.main  || '#fff',
    borderWidth: 2,
    pointBackgroundColor: MODEL_COLORS[key]?.main || '#fff',
    pointRadius: 4,
  }));

  _charts[canvasId] = new Chart(canvas, {
    type: 'radar',
    data: { labels: axes, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 1,
          ticks:     { color: CHART_TEXT_COLOR, backdropColor: 'transparent', stepSize: 0.2 },
          grid:      { color: GRID_COLOR },
          angleLines:{ color: GRID_COLOR },
          pointLabels:{ color: CHART_TEXT_COLOR, font: { family: 'Inter', size: 11 } },
        },
      },
      plugins: {
        legend: { labels: { color: CHART_TEXT_COLOR, font: { family: 'Inter', size: 12 } } },
        tooltip: {
          backgroundColor: 'rgba(17,24,39,0.95)',
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
        },
      },
    },
  });
}

// ─── Line Chart (score trend across questions) ────────────
export function renderLineChart(canvasId, questionResults) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = questionResults.map((_, i) => `Q${i + 1}`);
  const models = ['minilm', 'e5', 'bge'];

  const datasets = models.map(key => ({
    label: { minilm: 'MiniLM', e5: 'E5-Large', bge: 'BGE-Large' }[key],
    data: questionResults.map(r => r[`${key}_bertscore`] || 0),
    borderColor: MODEL_COLORS[key]?.main,
    backgroundColor: MODEL_COLORS[key]?.bg,
    fill: false,
    tension: 0.3,
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
  }));

  const opts = defaultChartOptions('BERTScore Trend Across Questions');
  opts.scales.y.min = 0;
  opts.scales.y.max = 1;
  opts.scales.y.ticks.callback = v => (v * 100).toFixed(0) + '%';

  _charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: opts,
  });
}
