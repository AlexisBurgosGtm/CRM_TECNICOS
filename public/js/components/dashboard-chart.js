import { formatDate, formatImporte } from '../format.js';

const chartInstances = new Map();

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildDailyTotals(items, desde, hasta, dateKey, amountKey) {
  const labels = [];
  const values = [];
  const totals = new Map();

  const cursor = new Date(`${desde}T00:00:00`);
  const end = new Date(`${hasta}T00:00:00`);

  while (cursor <= end) {
    const key = toDateInput(cursor);
    totals.set(key, 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const item of items) {
    const day = item[dateKey];
    if (!day || !totals.has(day)) continue;
    totals.set(day, totals.get(day) + (item[amountKey] != null ? Number(item[amountKey]) : 0));
  }

  for (const [isoDate, total] of totals) {
    labels.push(formatDate(isoDate));
    values.push(total);
  }

  return { labels, values };
}

export function destroyImporteChart(canvas) {
  if (canvas?.id) {
    const instance = chartInstances.get(canvas.id);
    if (instance) {
      instance.destroy();
      chartInstances.delete(canvas.id);
    }
    return;
  }

  chartInstances.forEach((instance) => instance.destroy());
  chartInstances.clear();
}

export async function renderImporteLineChart(canvas, items, desde, hasta, options = {}) {
  if (!canvas) return;

  const dateKey = options.dateKey || 'fecha_inicio';
  const amountKey = options.amountKey || 'totalprecio';
  const colors = options.colors || {
    border: '#7c3aed',
    fill: 'rgba(124, 58, 237, 0.12)',
    point: '#5b21b6',
  };

  destroyImporteChart(canvas);

  const { labels, values } = buildDailyTotals(items, desde, hasta, dateKey, amountKey);
  const Chart = (await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/auto/+esm')).default;

  const instance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Importe',
          data: values,
          borderColor: colors.border,
          backgroundColor: colors.fill,
          pointBackgroundColor: colors.point,
          pointBorderColor: '#fff',
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          fill: true,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Importe: ${formatImporte(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
          },
          grid: {
            display: false,
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) =>
              `Q ${Number(value).toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}`,
          },
        },
      },
    },
  });

  chartInstances.set(canvas.id, instance);
}
