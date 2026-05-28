import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { toastSuccess, toastError } from '../alerts.js';
import { formatDate, formatImporte } from '../format.js';
import { statusBadge, renderTicketDetailHtml, bindPhotoZoom } from '../components/ticket-detail.js';
import { renderImporteLineChart, destroyImporteChart } from '../components/dashboard-chart.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toDateInput(start), end: toDateInput(end) };
}

function rangeToIso(fromDate, toDate) {
  return {
    start: `${fromDate}T00:00:00`,
    end: `${toDate}T23:59:59`,
  };
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function filterTickets(tickets, estatusFiltro) {
  if (estatusFiltro === 'pendiente') {
    return tickets.filter((t) => t.status === 'PENDIENTE');
  }
  if (estatusFiltro === 'realizado') {
    return tickets.filter((t) => t.status === 'FINALIZADO');
  }
  return tickets;
}

export async function renderHome(root) {
  updateAppShell('inicio', 'Inicio');
  const { start, end } = monthRange();
  let dashboardData = { tickets: [], empleados: [] };

  root.innerHTML = `
    <main class="container-fluid py-2">
      <div class="row g-3 dashboard-split">
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header card-header-app py-2">
              <h2 class="h6 mb-0"><i class="fa-solid fa-ticket me-2"></i>Tickets</h2>
            </div>
            <div class="card-body py-2">
              <form id="filtroTicketsForm" class="mb-2">
                <div class="row g-2 align-items-end">
                  <div class="col-4 col-md-4">
                    <label class="form-label" for="filtroDesde">Desde</label>
                    <input type="date" class="form-control form-control-sm" id="filtroDesde" value="${start}" required>
                  </div>
                  <div class="col-4 col-md-4">
                    <label class="form-label" for="filtroHasta">Hasta</label>
                    <input type="date" class="form-control form-control-sm" id="filtroHasta" value="${end}" required>
                  </div>
                  <div class="col-4 col-md-4">
                    <label class="form-label" for="filtroEstatus">Estatus</label>
                    <select class="form-select form-select-sm" id="filtroEstatus">
                      <option value="">Todas</option>
                      <option value="pendiente">Pendientes</option>
                      <option value="realizado">Finalizados</option>
                    </select>
                  </div>
                </div>
                <div class="row mt-2">
                  <div class="col-12 text-end">
                    <h3 class="mb-0 text-danger" id="ticketsTotalPrecio">Q 0.00</h3>
                  </div>
                </div>
              </form>
              <div class="table-responsive eventos-list-wrap">
                <table class="table table-sm table-hover small mb-0">
                  <thead>
                    <tr>
                      <th>Inicio</th>
                      <th>Empleado</th>
                      <th>Cliente</th>
                      <th>Reporte</th>
                      <th>Total precio</th>
                      <th>Estatus</th>
                    </tr>
                  </thead>
                  <tbody id="ticketsListBody">
                    <tr><td colspan="6" class="text-center text-muted">Cargando...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm mb-3 dashboard-chart-card">
            <div class="card-header card-header-app py-2">
              <h2 class="h6 mb-0"><i class="fa-solid fa-chart-line me-2"></i>Importe por fecha</h2>
            </div>
            <div class="card-body py-2">
              <div class="dashboard-importe-chart-wrap">
                <canvas id="importePorFechaChart" aria-label="Gráfica de importe por fecha"></canvas>
              </div>
            </div>
          </div>
          <div class="card border-0 shadow-sm">
            <div class="card-header card-header-app py-2">
              <h2 class="h6 mb-0"><i class="fa-solid fa-user-group me-2"></i>Empleados — pendientes</h2>
            </div>
            <div class="card-body py-2">
              <ul class="list-group list-group-flush small" id="empleadosResumenList">
                <li class="list-group-item text-muted">Cargando...</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
    <div class="modal fade" id="homeTicketModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable modal-lg">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="homeTicketModalLabel">Detalle del ticket</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body py-2" id="homeTicketModalBody"></div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal fade" id="pendientesEmpleadoModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable modal-lg">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="pendientesEmpleadoModalLabel">Tickets pendientes</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body py-2" id="pendientesEmpleadoBody"></div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await bindLogout();

  const ticketsListBody = document.getElementById('ticketsListBody');
  const empleadosResumenList = document.getElementById('empleadosResumenList');
  const pendientesModal = new bootstrap.Modal(document.getElementById('pendientesEmpleadoModal'));
  const ticketDetailModal = new bootstrap.Modal(document.getElementById('homeTicketModal'));

  function openTicketDetailModal(ticket) {
    document.getElementById('homeTicketModalLabel').textContent = `Ticket #${ticket.id}`;
    const body = document.getElementById('homeTicketModalBody');
    body.innerHTML = renderTicketDetailHtml(ticket);
    bindPhotoZoom(body);
    ticketDetailModal.show();
  }

  function bindTicketRowActions() {
    document.querySelectorAll('.home-ticket-row').forEach((row) => {
      row.addEventListener('click', async () => {
        const id = Number(row.dataset.id);
        try {
          const ticket = await api.getTicket(id);
          openTicketDetailModal(ticket);
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  function updateTotalPrecio(tickets) {
    const total = tickets.reduce((sum, t) => sum + (t.totalprecio != null ? Number(t.totalprecio) : 0), 0);
    document.getElementById('ticketsTotalPrecio').textContent = formatImporte(total);
  }

  async function updateImporteChart(tickets) {
    const desde = document.getElementById('filtroDesde').value;
    const hasta = document.getElementById('filtroHasta').value;
    const canvas = document.getElementById('importePorFechaChart');
    if (!desde || !hasta || desde > hasta) {
      destroyImporteChart();
      return;
    }
    try {
      await renderImporteLineChart(canvas, tickets, desde, hasta);
    } catch (err) {
      destroyImporteChart();
      console.warn('No se pudo renderizar la gráfica:', err);
    }
  }

  function renderTicketsTable(tickets) {
    updateTotalPrecio(tickets);
    updateImporteChart(tickets);

    if (!tickets.length) {
      ticketsListBody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted">No hay tickets con el filtro seleccionado.</td></tr>';
      return;
    }

    ticketsListBody.innerHTML = tickets
      .map(
        (t) => `
          <tr class="home-ticket-row" role="button" data-id="${t.id}" title="Ver detalle del ticket">
            <td class="text-nowrap">${escapeHtml(formatDate(t.fecha_inicio))}</td>
            <td>${escapeHtml(t.empleado_nombre)}</td>
            <td>${escapeHtml(t.cliente_empresa || t.cliente_nombre || '—')}</td>
            <td>${escapeHtml(t.reporte_cliente || '—')}</td>
            <td class="text-end text-nowrap">${
              t.totalprecio != null ? escapeHtml(formatImporte(t.totalprecio)) : '—'
            }</td>
            <td>${statusBadge(t.status)}</td>
          </tr>`
      )
      .join('');

    bindTicketRowActions();
  }

  function openPendientesModal(empleado) {
    const tareas = dashboardData.tickets
      .filter((t) => t.codigo_empleado === empleado.codigo && t.status === 'PENDIENTE')
      .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));

    document.getElementById('pendientesEmpleadoModalLabel').textContent =
      `Pendientes — ${empleado.nombre}`;

    const body = document.getElementById('pendientesEmpleadoBody');
    if (!tareas.length) {
      body.innerHTML = '<p class="text-muted mb-0">No hay tickets pendientes en el rango seleccionado.</p>';
    } else {
      body.innerHTML = `
        <div class="table-responsive">
          <table class="table table-sm table-hover small mb-0">
            <thead>
              <tr>
                <th>Inicio</th>
                <th>Cliente</th>
                <th>Reporte</th>
              </tr>
            </thead>
            <tbody>
              ${tareas
                .map(
                  (t) => `
                <tr>
                  <td class="text-nowrap">${escapeHtml(formatDate(t.fecha_inicio))}</td>
                  <td>${escapeHtml(t.cliente_empresa || t.cliente_nombre || '—')}</td>
                  <td>${escapeHtml(t.reporte_cliente || '—')}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>`;
    }
    pendientesModal.show();
  }

  async function loadDashboard() {
    const desde = document.getElementById('filtroDesde').value;
    const hasta = document.getElementById('filtroHasta').value;
    const estatusFiltro = document.getElementById('filtroEstatus').value;
    if (!desde || !hasta) {
      toastError('Seleccione el rango de fechas.');
      return;
    }
    if (desde > hasta) {
      toastError('La fecha inicial no puede ser mayor que la final.');
      return;
    }

    try {
      const { start, end } = rangeToIso(desde, hasta);
      dashboardData = await api.getDashboardResumen(start, end);
      const ticketsFiltrados = filterTickets(dashboardData.tickets, estatusFiltro);
      renderTicketsTable(ticketsFiltrados);

      if (!dashboardData.empleados.length) {
        empleadosResumenList.innerHTML =
          '<li class="list-group-item text-muted">No hay empleados registrados.</li>';
      } else {
        empleadosResumenList.innerHTML = dashboardData.empleados
          .map(
            (e) => `
          <li class="list-group-item d-flex justify-content-between align-items-center px-0 empleado-resumen-item"
              role="button" data-codigo="${e.codigo}" title="Ver tickets pendientes">
            <div>
              <strong>${escapeHtml(e.nombre)}</strong>
              <span class="text-muted ms-1">(${escapeHtml(e.telefono)})</span>
            </div>
            <span class="badge rounded-pill ${e.pendientes > 0 ? 'text-bg-warning' : 'text-bg-light border'}">
              ${e.pendientes} pendiente${e.pendientes === 1 ? '' : 's'}
            </span>
          </li>`
          )
          .join('');

        document.querySelectorAll('.empleado-resumen-item').forEach((item) => {
          item.addEventListener('click', () => {
            const emp = dashboardData.empleados.find(
              (x) => x.codigo === Number(item.dataset.codigo)
            );
            if (emp) openPendientesModal(emp);
          });
        });
      }
    } catch (err) {
      ticketsListBody.innerHTML =
        '<tr><td colspan="6" class="text-center text-danger">Error al cargar tickets</td></tr>';
      document.getElementById('ticketsTotalPrecio').textContent = formatImporte(0);
      destroyImporteChart();
      empleadosResumenList.innerHTML = '<li class="list-group-item text-danger">Error al cargar</li>';
      toastError(err.message);
    }
  }

  document.getElementById('filtroTicketsForm').addEventListener('submit', (e) => {
    e.preventDefault();
  });

  function onFiltroFechaChange() {
    const desde = document.getElementById('filtroDesde').value;
    const hasta = document.getElementById('filtroHasta').value;
    if (!desde || !hasta) return;
    if (desde > hasta) return;
    loadDashboard();
  }

  document.getElementById('filtroDesde').addEventListener('change', onFiltroFechaChange);
  document.getElementById('filtroHasta').addEventListener('change', onFiltroFechaChange);

  document.getElementById('filtroEstatus').addEventListener('change', () => {
    const estatusFiltro = document.getElementById('filtroEstatus').value;
    renderTicketsTable(filterTickets(dashboardData.tickets, estatusFiltro));
  });

  await loadDashboard();
}
