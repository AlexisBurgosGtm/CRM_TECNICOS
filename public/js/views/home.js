import * as api from '../api.js';
import { renderAppShell, bindLogout } from '../components/layout.js';
import { toastSuccess, toastError } from '../alerts.js';
import { formatDate } from '../format.js';

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
  const { start, end } = monthRange();
  let dashboardData = { tickets: [], empleados: [] };

  root.innerHTML = `
    ${renderAppShell('inicio', 'Inicio')}
    <main class="container-fluid py-2">
      <div class="row g-3 dashboard-split">
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header card-header-app py-2">
              <h2 class="h6 mb-0"><i class="fa-solid fa-ticket me-2"></i>Tickets</h2>
            </div>
            <div class="card-body py-2">
              <form id="filtroTicketsForm" class="row g-2 align-items-end mb-2">
                <div class="col-4 col-md-3">
                  <label class="form-label" for="filtroDesde">Desde</label>
                  <input type="date" class="form-control form-control-sm" id="filtroDesde" value="${start}" required>
                </div>
                <div class="col-4 col-md-3">
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
                <div class="col-12 col-md-2">
                  <button type="submit" class="btn btn-primary btn-sm w-100">
                    <i class="fa-solid fa-magnifying-glass me-1"></i>Buscar
                  </button>
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
                      <th>Estatus</th>
                    </tr>
                  </thead>
                  <tbody id="ticketsListBody">
                    <tr><td colspan="5" class="text-center text-muted">Cargando...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm h-100">
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

  function statusBadge(status) {
    if (status === 'FINALIZADO') {
      return '<span class="badge badge-estatus-realizado">Finalizado</span>';
    }
    return '<span class="badge badge-estatus-pendiente">Pendiente</span>';
  }

  function renderTicketsTable(tickets) {
    if (!tickets.length) {
      ticketsListBody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted">No hay tickets con el filtro seleccionado.</td></tr>';
      return;
    }

    ticketsListBody.innerHTML = tickets
      .map(
        (t) => `
          <tr>
            <td class="text-nowrap">${escapeHtml(formatDate(t.fecha_inicio))}</td>
            <td>${escapeHtml(t.empleado_nombre)}</td>
            <td>${escapeHtml(t.cliente_empresa || t.cliente_nombre || '—')}</td>
            <td>${escapeHtml(t.reporte_cliente || '—')}</td>
            <td>${statusBadge(t.status)}</td>
          </tr>`
      )
      .join('');
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
                <th>Accesos</th>
                <th>Notas</th>
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
                  <td>${escapeHtml(t.accesos || '—')}</td>
                  <td>${escapeHtml(t.notas || '—')}</td>
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
        '<tr><td colspan="5" class="text-center text-danger">Error al cargar tickets</td></tr>';
      empleadosResumenList.innerHTML = '<li class="list-group-item text-danger">Error al cargar</li>';
      toastError(err.message);
    }
  }

  document.getElementById('filtroTicketsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    loadDashboard();
  });

  await loadDashboard();
}
