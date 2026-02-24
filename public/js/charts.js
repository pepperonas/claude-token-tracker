// Chart.js configuration and helpers

/** Date format for chart axis labels: 'us' = MM-DD, 'de' = DD.MM. */
let chartDateFormat = localStorage.getItem('dateFormat') || 'us';

function formatChartDate(dateStr) {
  // dateStr is YYYY-MM-DD or HH:00 (hourly mode)
  if (dateStr.includes(':')) return dateStr;
  const mm = dateStr.slice(5, 7);
  const dd = dateStr.slice(8, 10);
  return chartDateFormat === 'de' ? `${dd}.${mm}.` : `${mm}-${dd}`;
}

function setChartDateFormat(fmt) {
  chartDateFormat = fmt;
  localStorage.setItem('dateFormat', fmt);
}

const COLORS = {
  input: '#58a6ff',
  output: '#3fb950',
  cacheRead: '#bc8cff',
  cacheCreate: '#d29922',
  cost: '#39d2c0',
  red: '#f85149',
  models: ['#58a6ff', '#3fb950', '#bc8cff', '#d29922', '#f85149', '#39d2c0']
};

function saveChartLegendState(chartId, chart) {
  const store = JSON.parse(localStorage.getItem('chartLegendHidden') || '{}');
  const hidden = [];
  const isDoughnut = chart.config.type === 'doughnut' || chart.config.type === 'pie';
  if (isDoughnut) {
    const meta = chart.getDatasetMeta(0);
    meta.data.forEach((_, i) => {
      if (!chart.getDataVisibility(i)) hidden.push(i);
    });
  } else {
    chart.data.datasets.forEach((ds, i) => {
      if (ds.hidden) hidden.push(i);
    });
  }
  if (hidden.length > 0) store[chartId] = hidden;
  else delete store[chartId];
  localStorage.setItem('chartLegendHidden', JSON.stringify(store));
}

function restoreChartLegendState(chartId, chart) {
  const store = JSON.parse(localStorage.getItem('chartLegendHidden') || '{}');
  const hidden = store[chartId];
  if (!hidden || !Array.isArray(hidden)) return;
  const isDoughnut = chart.config.type === 'doughnut' || chart.config.type === 'pie';
  if (isDoughnut) {
    hidden.forEach(i => {
      if (i < chart.data.datasets[0].data.length) {
        chart.toggleDataVisibility(i);
      }
    });
  } else {
    hidden.forEach(i => {
      if (i < chart.data.datasets.length) {
        chart.data.datasets[i].hidden = true;
      }
    });
  }
  chart.update('none');
}

// Chart.js global defaults
function initChartDefaults() {
  Chart.defaults.color = '#8b949e';
  Chart.defaults.borderColor = '#30363d';
  Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyleWidth = 10;
  Chart.defaults.plugins.tooltip.backgroundColor = '#1c2128';
  Chart.defaults.plugins.tooltip.borderColor = '#30363d';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;

  const defaultLegendClick = Chart.defaults.plugins.legend.onClick;
  Chart.defaults.plugins.legend.onClick = function(e, legendItem, legend) {
    defaultLegendClick.call(this, e, legendItem, legend);
    const chart = legend.chart;
    const canvasId = chart.canvas.id;
    saveChartLegendState(canvasId, chart);
  };
}

function formatTokens(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function formatCost(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

// --- Chart creators ---

let chartInstances = {};
let chartAnimateNext = true;

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function createDailyTokenChart(canvasId, data, includeCache) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  const datasets = [
    {
      label: 'Input',
      data: data.map(d => d.inputTokens),
      backgroundColor: COLORS.input,
      stack: 'tokens'
    },
    {
      label: 'Output',
      data: data.map(d => d.outputTokens),
      backgroundColor: COLORS.output,
      stack: 'tokens'
    }
  ];
  if (includeCache) {
    datasets.push(
      {
        label: 'Cache Read',
        data: data.map(d => d.cacheReadTokens),
        backgroundColor: COLORS.cacheRead,
        stack: 'tokens'
      },
      {
        label: 'Cache Create',
        data: data.map(d => d.cacheCreateTokens),
        backgroundColor: COLORS.cacheCreate,
        stack: 'tokens'
      }
    );
  }
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: { labels: data.map(d => formatChartDate(d.date)), datasets },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatTokens(ctx.raw)}`
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          ticks: { callback: v => formatTokens(v) }
        }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createDailyCostChart(canvasId, data) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => formatChartDate(d.date)),
      datasets: [{
        label: 'API-equivalent Cost',
        data: data.map(d => d.cost),
        borderColor: COLORS.cost,
        backgroundColor: COLORS.cost + '20',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => formatCost(ctx.raw)
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          ticks: { callback: v => '$' + v }
        }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createModelDoughnut(canvasId, data, includeCache) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  const tokenValues = data.map(d => {
    if (includeCache) return d.totalTokens;
    return (d.inputTokens || 0) + (d.outputTokens || 0);
  });
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        data: tokenValues,
        backgroundColor: COLORS.models.slice(0, data.length),
        borderWidth: 0
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${formatTokens(ctx.raw)} (${formatCost(data[ctx.dataIndex].cost)})`
          }
        }
      },
      cutout: '60%'
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createHourlyChart(canvasId, data) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.hour + ':00'),
      datasets: [{
        label: 'Messages',
        data: data.map(d => d.messages),
        backgroundColor: COLORS.input + '80',
        borderColor: COLORS.input,
        borderWidth: 1
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createProjectBarChart(canvasId, data, includeCache) {
  destroyChart(canvasId);
  const top = data.slice(0, 15);
  const ctx = document.getElementById(canvasId).getContext('2d');
  const tokenValues = top.map(d => {
    if (includeCache) return d.totalTokens;
    return (d.inputTokens || 0) + (d.outputTokens || 0);
  });
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(d => d.name.length > 25 ? d.name.slice(0, 25) + '...' : d.name),
      datasets: [{
        label: 'Total Tokens',
        data: tokenValues,
        backgroundColor: COLORS.input + '80',
        borderColor: COLORS.input,
        borderWidth: 1
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatTokens(ctx.raw)
          }
        }
      },
      scales: {
        x: { ticks: { callback: v => formatTokens(v) } },
        y: { grid: { display: false } }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createToolBarChart(canvasId, data) {
  destroyChart(canvasId);
  const top = data.slice(0, 15);
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(d => d.name),
      datasets: [{
        label: 'Calls',
        data: top.map(d => d.count),
        backgroundColor: COLORS.cacheRead + '80',
        borderColor: COLORS.cacheRead,
        borderWidth: 1
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatNumber(ctx.raw) + ' calls'
          }
        }
      },
      scales: {
        x: { ticks: { callback: v => formatNumber(v) } },
        y: { grid: { display: false } }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createModelAreaChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;

  const allModels = new Set();
  data.forEach(d => {
    Object.keys(d).filter(k => k !== 'date').forEach(m => allModels.add(m));
  });
  const models = [...allModels];

  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => formatChartDate(d.date)),
      datasets: models.map((model, i) => ({
        label: model,
        data: data.map(d => d[model] || 0),
        borderColor: COLORS.models[i % COLORS.models.length],
        backgroundColor: COLORS.models[i % COLORS.models.length] + '30',
        fill: true,
        tension: 0.3,
        pointRadius: 2
      }))
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatTokens(ctx.raw)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, stacked: true },
        y: {
          stacked: true,
          ticks: { callback: v => formatTokens(v) }
        }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

// --- Overview: adaptive lines + messages chart ---

function createOverviewLinesChart(canvasId, daily, hourly, period) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');

  if (period === 'today') {
    // Hourly: stacked bar for lines by hour
    const totalLines = hourly.map(h => (h.linesWritten || 0) + (h.linesAdded || 0) + (h.linesRemoved || 0));
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: hourly.map(h => h.hour + ':00'),
        datasets: [
          {
            label: t('linesWritten'),
            data: hourly.map(h => h.linesWritten || 0),
            backgroundColor: '#3fb950',
            stack: 'lines'
          },
          {
            label: t('linesEdited'),
            data: hourly.map(h => h.linesAdded || 0),
            backgroundColor: '#d29922',
            stack: 'lines'
          },
          {
            label: t('linesDeleted'),
            data: hourly.map(h => h.linesRemoved || 0),
            backgroundColor: '#f85149',
            stack: 'lines'
          },
          {
            label: t('messagesLabel'),
            data: hourly.map(h => h.messages || 0),
            type: 'line',
            borderColor: COLORS.input,
            backgroundColor: COLORS.input + '20',
            tension: 0.3,
            pointRadius: 2,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        animation: chartAnimateNext ? undefined : false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.yAxisID === 'y1') return `${ctx.dataset.label}: ${formatNumber(ctx.raw)}`;
                return `${ctx.dataset.label}: ${formatNumber(ctx.raw)}`;
              }
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, position: 'left', ticks: { callback: v => formatNumber(v) } },
          y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: v => formatNumber(v) } }
        }
      }
    });
  } else {
    // Daily: stacked bar for lines per day + messages line
    if (!daily || daily.length === 0) return;
    chartInstances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: daily.map(d => formatChartDate(d.date)),
        datasets: [
          {
            label: t('linesWritten'),
            data: daily.map(d => d.linesWritten || 0),
            backgroundColor: '#3fb950',
            stack: 'lines'
          },
          {
            label: t('linesEdited'),
            data: daily.map(d => d.linesAdded || 0),
            backgroundColor: '#d29922',
            stack: 'lines'
          },
          {
            label: t('linesDeleted'),
            data: daily.map(d => d.linesRemoved || 0),
            backgroundColor: '#f85149',
            stack: 'lines'
          },
          {
            label: t('messagesLabel'),
            data: daily.map(d => d.messages || 0),
            type: 'line',
            borderColor: COLORS.input,
            backgroundColor: COLORS.input + '20',
            tension: 0.3,
            pointRadius: 2,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        animation: chartAnimateNext ? undefined : false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, position: 'left', ticks: { callback: v => formatNumber(v) } },
          y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: v => formatNumber(v) } }
        }
      }
    });
  }
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

// --- Insights chart creators ---

function createCostBreakdownChart(canvasId, data, includeCache) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  const datasets = [
    {
      label: 'Input',
      data: data.map(d => d.inputCost),
      borderColor: COLORS.input,
      backgroundColor: COLORS.input + '30',
      fill: true,
      tension: 0.3,
      pointRadius: 2
    },
    {
      label: 'Output',
      data: data.map(d => d.outputCost),
      borderColor: COLORS.output,
      backgroundColor: COLORS.output + '30',
      fill: true,
      tension: 0.3,
      pointRadius: 2
    }
  ];
  if (includeCache) {
    datasets.push(
      {
        label: 'Cache Read',
        data: data.map(d => d.cacheReadCost),
        borderColor: COLORS.cacheRead,
        backgroundColor: COLORS.cacheRead + '30',
        fill: true,
        tension: 0.3,
        pointRadius: 2
      },
      {
        label: 'Cache Create',
        data: data.map(d => d.cacheCreateCost),
        borderColor: COLORS.cacheCreate,
        backgroundColor: COLORS.cacheCreate + '30',
        fill: true,
        tension: 0.3,
        pointRadius: 2
      }
    );
  }
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => formatChartDate(d.date)),
      datasets
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatCost(ctx.raw)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, stacked: true },
        y: {
          stacked: true,
          ticks: { callback: v => '$' + v }
        }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createCumulativeCostChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => formatChartDate(d.date)),
      datasets: [{
        label: t('cumulativeCost'),
        data: data.map(d => d.cost),
        borderColor: COLORS.cost,
        backgroundColor: COLORS.cost + '20',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => formatCost(ctx.raw)
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: v => '$' + v } }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createWeekdayChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.day),
      datasets: [
        {
          label: t('messagesLabel'),
          data: data.map(d => d.messages),
          backgroundColor: COLORS.input + '80',
          borderColor: COLORS.input,
          borderWidth: 1,
          yAxisID: 'y'
        },
        {
          label: t('cost'),
          data: data.map(d => d.cost),
          type: 'line',
          borderColor: COLORS.cost,
          backgroundColor: COLORS.cost + '20',
          tension: 0.3,
          pointRadius: 4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.yAxisID === 'y1') return formatCost(ctx.raw);
              return `${ctx.dataset.label}: ${formatNumber(ctx.raw)}`;
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { position: 'left', beginAtZero: true },
        y1: {
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: { callback: v => '$' + v }
        }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createCacheEfficiencyChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => formatChartDate(d.date)),
      datasets: [{
        label: 'Cache Hit Rate %',
        data: data.map(d => d.cacheHitRate),
        borderColor: COLORS.cacheRead,
        backgroundColor: COLORS.cacheRead + '20',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.raw.toFixed(1) + '%'
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          min: 0,
          max: 100,
          ticks: { callback: v => v + '%' }
        }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createDailyLinesChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => formatChartDate(d.date)),
      datasets: [
        {
          label: t('linesWritten'),
          data: data.map(d => d.linesWritten),
          backgroundColor: '#3fb950',
          stack: 'lines'
        },
        {
          label: t('linesEdited'),
          data: data.map(d => d.linesAdded),
          backgroundColor: '#d29922',
          stack: 'lines'
        },
        {
          label: t('linesDeleted'),
          data: data.map(d => d.linesRemoved),
          backgroundColor: '#f85149',
          stack: 'lines'
        }
      ]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.raw)}`
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          ticks: { callback: v => formatNumber(v) }
        }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createStopReasonsChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.reason),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: COLORS.models.slice(0, data.length),
        borderWidth: 0
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${formatNumber(ctx.raw)} (${data[ctx.dataIndex].percentage}%)`
          }
        }
      },
      cutout: '60%'
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

// --- Productivity chart creators ---

function createProductivityDailyChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => formatChartDate(d.date)),
      datasets: [{
        label: t('linesPerHour'),
        data: data.map(d => d.linesPerHour),
        backgroundColor: COLORS.output + '80',
        borderColor: COLORS.output,
        borderWidth: 1
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${formatNumber(ctx.raw)} lines/h`
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: v => formatNumber(v) } }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createCostEfficiencyChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => formatChartDate(d.date)),
      datasets: [{
        label: t('costPerLine'),
        data: data.map(d => d.costPerLine),
        borderColor: COLORS.cost,
        backgroundColor: COLORS.cost + '20',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => '$' + ctx.raw.toFixed(3) + '/line'
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: v => '$' + v.toFixed(3) } }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createCodeRatioChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.reason),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: [COLORS.output, COLORS.input, COLORS.cacheCreate, COLORS.red, COLORS.cacheRead],
        borderWidth: 0
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${formatNumber(ctx.raw)} (${data[ctx.dataIndex].percentage}%)`
          }
        }
      },
      cutout: '60%'
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

function createSessionEfficiencyChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  // Take top 50 sessions for readability
  const top = data.slice(0, 50);
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: t('sessionEfficiency'),
        data: top.map(d => ({ x: d.tokensPerMessage, y: d.costPerMessage })),
        backgroundColor: COLORS.input + '80',
        borderColor: COLORS.input,
        pointRadius: 5,
        pointHoverRadius: 8
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = top[ctx.dataIndex];
              return `${d.project}: ${formatTokens(d.tokensPerMessage)} tok/msg, ${formatCost(d.costPerMessage)}/msg`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Tokens/Message' },
          ticks: { callback: v => formatTokens(v) }
        },
        y: {
          title: { display: true, text: 'Cost/Message' },
          ticks: { callback: v => '$' + v.toFixed(3) }
        }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

/** Efficiency trend: tokensPerLine + linesPerTurn with 7-day rolling averages */
function createEfficiencyTrendChart(canvasId, daily, rolling) {
  destroyChart(canvasId);
  if (!daily || daily.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: daily.map(d => formatChartDate(d.date)),
      datasets: [
        {
          label: t('tokensPerLineLabel'),
          data: daily.map(d => d.tokensPerLine),
          borderColor: COLORS.input + '40',
          backgroundColor: 'transparent',
          pointRadius: 2,
          borderWidth: 1,
          borderDash: [3, 3],
          yAxisID: 'y'
        },
        {
          label: t('tokensPerLineLabel') + ' (7d \u00f8)',
          data: rolling.map(d => d.tokensPerLine),
          borderColor: COLORS.input,
          backgroundColor: COLORS.input + '15',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: t('linesPerTurnLabel'),
          data: daily.map(d => d.linesPerTurn),
          borderColor: COLORS.output + '40',
          backgroundColor: 'transparent',
          pointRadius: 2,
          borderWidth: 1,
          borderDash: [3, 3],
          yAxisID: 'y1'
        },
        {
          label: t('linesPerTurnLabel') + ' (7d \u00f8)',
          data: rolling.map(d => d.linesPerTurn),
          borderColor: COLORS.output,
          backgroundColor: COLORS.output + '15',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'line' } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.datasetIndex <= 1) return ctx.dataset.label + ': ' + formatNumber(ctx.raw) + ' tok/line';
              return ctx.dataset.label + ': ' + ctx.raw + ' lines/turn';
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          position: 'left',
          title: { display: true, text: t('tokensPerLineLabel'), color: COLORS.input },
          ticks: { callback: v => formatNumber(v), color: COLORS.input + 'aa' },
          grid: { color: '#30363d40' }
        },
        y1: {
          position: 'right',
          title: { display: true, text: t('linesPerTurnLabel'), color: COLORS.output },
          ticks: { color: COLORS.output + 'aa' },
          grid: { display: false }
        }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

/** Model efficiency comparison — horizontal grouped bar chart */
function createModelComparisonChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [
        {
          label: t('tokensPerLineLabel'),
          data: data.map(d => d.tokensPerLine),
          backgroundColor: COLORS.input + '80',
          borderColor: COLORS.input,
          borderWidth: 1
        },
        {
          label: t('linesPerTurnLabel'),
          data: data.map(d => d.linesPerTurn),
          backgroundColor: COLORS.output + '80',
          borderColor: COLORS.output,
          borderWidth: 1
        },
        {
          label: t('toolsPerTurnLabel'),
          data: data.map(d => d.toolsPerTurn),
          backgroundColor: COLORS.cacheRead + '80',
          borderColor: COLORS.cacheRead,
          borderWidth: 1
        }
      ]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = data[ctx.dataIndex];
              if (ctx.datasetIndex === 0) return ctx.dataset.label + ': ' + formatNumber(ctx.raw) + ' tok/line (' + formatNumber(d.messages) + ' msgs)';
              if (ctx.datasetIndex === 1) return ctx.dataset.label + ': ' + ctx.raw + ' lines/turn';
              return ctx.dataset.label + ': ' + ctx.raw + ' tools/turn';
            }
          }
        }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: '#30363d40' } },
        y: { grid: { display: false } }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

/** Session depth analysis — bubble: messages (x) vs lines/turn (y), size = total lines */
function createSessionDepthChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const maxLines = Math.max(...data.map(d => d.totalLines), 1);
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bubble',
    data: {
      datasets: [{
        label: t('sessionDepthLabel'),
        data: data.map(d => ({
          x: d.messages,
          y: d.linesPerTurn,
          r: Math.max(3, Math.min(20, (d.totalLines / maxLines) * 20))
        })),
        backgroundColor: COLORS.cacheRead + '50',
        borderColor: COLORS.cacheRead,
        borderWidth: 1
      }]
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = data[ctx.dataIndex];
              return [
                d.project,
                t('messages') + ': ' + d.messages,
                t('linesPerTurnLabel') + ': ' + d.linesPerTurn,
                t('totalLinesLabel') + ': ' + formatNumber(d.totalLines),
                t('costPerLine') + ': $' + d.costPerLine.toFixed(3)
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: t('messagesLabel') },
          ticks: { callback: v => formatNumber(v) },
          grid: { color: '#30363d40' }
        },
        y: {
          title: { display: true, text: t('linesPerTurnLabel') },
          beginAtZero: true,
          grid: { color: '#30363d40' }
        }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}

/** Tool usage evolution — stacked area chart showing tool proportions over time */
function createToolEvolutionChart(canvasId, daily) {
  destroyChart(canvasId);
  if (!daily || daily.length === 0) return;

  // Aggregate tool counts per day from the daily data
  const toolTotals = {};
  for (const d of daily) {
    if (d.tools) {
      for (const [name, count] of Object.entries(d.tools)) {
        toolTotals[name] = (toolTotals[name] || 0) + count;
      }
    }
  }

  // Top 8 tools by total count
  const topTools = Object.entries(toolTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => name);

  if (topTools.length === 0) return;

  const palette = ['#58a6ff', '#3fb950', '#bc8cff', '#d29922', '#f85149', '#39d2c0', '#f0883e', '#8b949e'];
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: daily.map(d => formatChartDate(d.date)),
      datasets: topTools.map((tool, i) => ({
        label: tool,
        data: daily.map(d => (d.tools && d.tools[tool]) || 0),
        borderColor: palette[i % palette.length],
        backgroundColor: palette[i % palette.length] + '30',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 1.5
      }))
    },
    options: {
      animation: chartAnimateNext ? undefined : false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle' } },
        tooltip: {
          callbacks: {
            label: (ctx) => ctx.dataset.label + ': ' + ctx.raw + ' calls'
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { callback: v => formatNumber(v) },
          grid: { color: '#30363d40' }
        }
      }
    }
  });
  restoreChartLegendState(canvasId, chartInstances[canvasId]);
}
