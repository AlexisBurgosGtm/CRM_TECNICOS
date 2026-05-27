import * as api from '../api.js';
import { renderAppShell, bindLogout } from '../components/layout.js';
import { toastSuccess, toastError, promptTotalPrecio } from '../alerts.js';
import { formatDateTime, formatImporte } from '../format.js';

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

function sumImporte(eventos) {
  return eventos.reduce((acc, e) => acc + (e.totalprecio == null ? 0 : Number(e.totalprecio)), 0);
}

function estatusBadge(estatus) {
  if (estatus === 'realizado') {
    return '<span class="badge badge-estatus-realizado">Realizado</span>';
  }
  return '<span class="badge badge-estatus-pendiente">Pendiente</span>';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function filterEventos(eventos, estatusFiltro) {
  if (estatusFiltro === 'pendiente') {
    return eventos.filter((e) => e.estatus === 'pendiente');
  }
  if (estatusFiltro === 'realizado') {
    return eventos.filter((e) => e.estatus === 'realizado');
  }
  return eventos;
}

export async function renderHome(root) {
  const { start, end } = monthRange();
  let dashboardData = { eventos: [], empleados: [] };

  root.innerHTML = `
    ${renderAppShell('inicio', 'Inicio')}
    <main class="container-fluid py-2">
      <div class="row g-3 dashboard-split">
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header card-header-app py-2">
              <h2 class="h6 mb-0"><i class="fa-solid fa-list-check me-2"></i>Eventos</h2>
            </div>
            <div class="card-body py-2">
              <form id="filtroEventosForm" class="row g-2 align-items-end mb-2">
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
                    <option value="realizado">Realizadas</option>
                  </select>
                </div>
                <div class="col-12 col-md-2">
                  <button type="submit" class="btn btn-primary btn-sm w-100">
                    <i class="fa-solid fa-magnifying-glass me-1"></i>Buscar
                  </button>
                </div>
              </form>
              <h1 class="h5 mb-2 dashboard-total-importe" id="totalImporteLabel">Total importe: Q 0.00</h1>
              <div class="table-responsive eventos-list-wrap">
                <table class="table table-sm table-hover small mb-0">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Fechas</th>
                      <th>Empleado</th>
                      <th>Cliente</th>
                      <th>Estatus</th>
                      <th>Importe</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody id="eventosListBody">
                    <tr><td colspan="7" class="text-center text-muted">Cargando...</td></tr>
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
            <h5 class="modal-title" id="pendientesEmpleadoModalLabel">Tareas pendientes</h5>
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

  const eventosListBody = document.getElementById('eventosListBody');
  const totalImporteLabel = document.getElementById('totalImporteLabel');
  const empleadosResumenList = document.getElementById('empleadosResumenList');
  const pendientesModal = new bootstrap.Modal(document.getElementById('pendientesEmpleadoModal'));

  function renderEventosTable(eventos) {
    totalImporteLabel.textContent = `Total importe: ${formatImporte(sumImporte(eventos))}`;

    if (!eventos.length) {
      eventosListBody.innerHTML =
        '<tr><td colspan="7" class="text-center text-muted">No hay eventos con el filtro seleccionado.</td></tr>';
      return;
    }

    eventosListBody.innerHTML = eventos
      .map(
        (e) => `
          <tr>
            <td>${escapeHtml(e.titulo)}</td>
            <td class="text-nowrap">${formatDateTime(e.inicio)}<br>${formatDateTime(e.fin)}</td>
            <td>${escapeHtml(e.empleado_nombre)}</td>
            <td>${escapeHtml(e.cliente_empresa || '—')}</td>
            <td>${estatusBadge(e.estatus)}</td>
            <td class="text-nowrap">${formatImporte(e.totalprecio)}</td>
            <td class="text-end">
              ${
                e.estatus === 'pendiente'
                  ? `<button type="button" class="btn btn-outline-primary btn-sm btn-marcar" data-id="${e.id}">Marcar realizado</button>`
                  : `<button type="button" class="btn btn-outline-secondary btn-sm btn-marcar" data-id="${e.id}" data-estatus="pendiente">Marcar pendiente</button>`
              }
            </td>
          </tr>`
      )
      .join('');

    document.querySelectorAll('.btn-marcar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        const nuevoEstatus = btn.dataset.estatus || 'realizado';
        const evento = dashboardData.eventos.find((x) => x.id === id);
        if (!evento) return;
        try {
          if (nuevoEstatus === 'realizado') {
            const totalprecio = await promptTotalPrecio();
            if (totalprecio === null) return;
            await api.completarEvento(id, totalprecio);
          } else {
            await api.updateEvento({
              id,
              titulo: evento.titulo,
              descripcion: evento.descripcion,
              observaciones: evento.observaciones,
              inicio: evento.inicio,
              fin: evento.fin,
              empleado_codigo: evento.empleado_codigo,
              cliente_codigo: evento.cliente_codigo,
              estatus: nuevoEstatus,
              totalprecio: evento.totalprecio,
              cotizado: evento.cotizado,
            });
          }
          toastSuccess('Estatus actualizado');
          await loadDashboard();
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  function openPendientesModal(empleado) {
    const tareas = dashboardData.eventos
      .filter((e) => e.empleado_codigo === empleado.codigo && e.estatus === 'pendiente')
      .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

    document.getElementById('pendientesEmpleadoModalLabel').textContent =
      `Pendientes — ${empleado.nombre}`;

    const body = document.getElementById('pendientesEmpleadoBody');
    if (!tareas.length) {
      body.innerHTML = '<p class="text-muted mb-0">No hay tareas pendientes en el rango seleccionado.</p>';
    } else {
      body.innerHTML = `
        <div class="table-responsive">
          <table class="table table-sm table-hover small mb-0">
            <thead>
              <tr>
                <th>Título</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Cliente</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${tareas
                .map(
                  (t) => `
                <tr>
                  <td>${escapeHtml(t.titulo)}</td>
                  <td class="text-nowrap">${formatDateTime(t.inicio)}</td>
                  <td class="text-nowrap">${formatDateTime(t.fin)}</td>
                  <td>${escapeHtml(t.cliente_empresa || '—')}</td>
                  <td>${escapeHtml(t.observaciones || '—')}</td>
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
      const eventosFiltrados = filterEventos(dashboardData.eventos, estatusFiltro);
      renderEventosTable(eventosFiltrados);

      if (!dashboardData.empleados.length) {
        empleadosResumenList.innerHTML =
          '<li class="list-group-item text-muted">No hay empleados registrados.</li>';
      } else {
        empleadosResumenList.innerHTML = dashboardData.empleados
          .map(
            (e) => `
          <li class="list-group-item d-flex justify-content-between align-items-center px-0 empleado-resumen-item"
              role="button" data-codigo="${e.codigo}" title="Ver tareas pendientes">
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
      eventosListBody.innerHTML =
        '<tr><td colspan="7" class="text-center text-danger">Error al cargar eventos</td></tr>';
      totalImporteLabel.textContent = 'Total importe: Q 0.00';
      empleadosResumenList.innerHTML = '<li class="list-group-item text-danger">Error al cargar</li>';
      toastError(err.message);
    }
  }

  document.getElementById('filtroEventosForm').addEventListener('submit', (e) => {
    e.preventDefault();
    loadDashboard();
  });

  await loadDashboard();
}
