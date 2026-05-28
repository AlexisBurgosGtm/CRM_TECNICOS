import { formatDate, formatImporte } from '../format.js';

let chartInstance = null;

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildDailyTotals(tickets, desde, hasta) {
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

  for (const ticket of tickets) {
    const day = ticket.fecha_inicio;
    if (!day || !totals.has(day)) continue;
    totals.set(day, totals.get(day) + (ticket.totalprecio != null ? Number(ticket.totalprecio) : 0));
  }

  for (const [isoDate, total] of totals) {
    labels.push(formatDate(isoDate));
    values.push(total);
  }

  return { labels, values };
}

export function destroyImporteChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

export async function renderImporteLineChart(canvas, tickets, desde, hasta) {
  if (!canvas) return;

  destroyImporteChart();

  const { labels, values } = buildDailyTotals(tickets, desde, hasta);
  const Chart = (await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/auto/+esm')).default;

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Importe',
          data: values,
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124, 58, 237, 0.12)',
          pointBackgroundColor: '#5b21b6',
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
}
