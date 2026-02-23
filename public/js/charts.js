// Chart.js configuration and helpers

const COLORS = {
  input: '#58a6ff',
  output: '#3fb950',
  cacheRead: '#bc8cff',
  cacheCreate: '#d29922',
  cost: '#39d2c0',
  red: '#f85149',
  models: ['#58a6ff', '#3fb950', '#bc8cff', '#d29922', '#f85149', '#39d2c0']
};

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

function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

function createDailyTokenChart(canvasId, data) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.date.slice(5)),
      datasets: [
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
        },
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
      ]
    },
    options: {
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
}

function createDailyCostChart(canvasId, data) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date.slice(5)),
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
}

function createModelDoughnut(canvasId, data) {
  destroyChart(canvasId);
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        data: data.map(d => d.totalTokens),
        backgroundColor: COLORS.models.slice(0, data.length),
        borderWidth: 0
      }]
    },
    options: {
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
}

function createProjectBarChart(canvasId, data) {
  destroyChart(canvasId);
  const top = data.slice(0, 15);
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map(d => d.name.length > 25 ? d.name.slice(0, 25) + '...' : d.name),
      datasets: [{
        label: 'Total Tokens',
        data: top.map(d => d.totalTokens),
        backgroundColor: COLORS.input + '80',
        borderColor: COLORS.input,
        borderWidth: 1
      }]
    },
    options: {
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
      labels: data.map(d => d.date.slice(5)),
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
}

// --- Insights chart creators ---

function createCostBreakdownChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date.slice(5)),
      datasets: [
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
        },
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
      ]
    },
    options: {
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
}

function createCumulativeCostChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date.slice(5)),
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
}

function createCacheEfficiencyChart(canvasId, data) {
  destroyChart(canvasId);
  if (!data || data.length === 0) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  chartInstances[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.date.slice(5)),
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
}
