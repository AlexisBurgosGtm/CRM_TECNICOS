import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { toastError, toastSuccess } from '../alerts.js';
import { formatDate, formatImporte } from '../format.js';
import { statusBadge, renderTicketDetailHtml, bindPhotoZoom } from '../components/ticket-detail.js';
import { exportRowsToExcel } from '../export-excel.js';

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function statusLabel(status) {
  return status === 'FINALIZADO' ? 'Finalizado' : 'Pendiente';
}

function matchesSearch(ticket, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    ticket.fecha_inicio,
    ticket.fecha_fin,
    ticket.empleado_nombre,
    ticket.cliente_empresa,
    ticket.cliente_nombre,
    ticket.reporte_cliente,
    ticket.status,
    ticket.totalprecio,
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  return haystack.includes(q);
}

export async function renderArchivo(root) {
  updateAppShell('archivo', 'Archivo');
  const { start, end } = monthRange();
  let tickets = [];
  let searchQuery = '';
  let detailModal = null;
  const tableColSpan = 8;

  root.innerHTML = `
    <main class="container-fluid py-2 cotizaciones-page">
      <div class="card border-0 shadow-sm">
        <div class="card-header card-header-app py-2">
          <h2 class="h6 mb-0"><i class="fa-solid fa-box-archive me-2"></i>Archivo de tickets</h2>
        </div>
        <div class="card-body py-2">
          <div id="filtroArchivo" class="mb-2">
            <div class="row g-2 align-items-end">
              <div class="col-md-4">
                <label class="form-label" for="archivoDesde">Desde</label>
                <input type="date" class="form-control form-control-sm" id="archivoDesde" value="${start}" required>
              </div>
              <div class="col-md-4">
                <label class="form-label" for="archivoHasta">Hasta</label>
                <input type="date" class="form-control form-control-sm" id="archivoHasta" value="${end}" required>
              </div>
              <div class="col-md-4">
                <h3 class="mb-1 text-danger text-end" id="archivoTotalImporte">Q 0.00</h3>
                <button type="button" class="btn btn-success btn-sm w-100" id="btnArchivoExportar">
                  <i class="fa-solid fa-file-excel me-1"></i>Exportar Excel
                </button>
              </div>
            </div>
            <div class="row g-2 mt-2">
              <div class="col-12">
                <label class="form-label visually-hidden" for="archivoSearch">Buscar en la tabla</label>
                <input type="search" class="form-control form-control-sm" id="archivoSearch"
                  placeholder="Buscar en la tabla…" autocomplete="off">
              </div>
            </div>
          </div>
          <div class="table-responsive cotizaciones-list-wrap">
            <table class="table table-sm table-hover small mb-0">
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Empleado</th>
                  <th>Cliente</th>
                  <th>Reporte cliente</th>
                  <th class="text-end">Importe</th>
                  <th>Status</th>
                  <th class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody id="archivoTableBody">
                <tr><td colspan="${tableColSpan}" class="text-center text-muted">Cargando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
    <div class="modal fade" id="archivoTicketModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable modal-lg">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="archivoTicketModalLabel">Detalle del ticket</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body py-2" id="archivoTicketModalBody"></div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await bindLogout();

  detailModal = new bootstrap.Modal(document.getElementById('archivoTicketModal'));
  const tableBody = document.getElementById('archivoTableBody');

  function openDetailModal(ticket) {
    document.getElementById('archivoTicketModalLabel').textContent = `Ticket #${ticket.id}`;
    const body = document.getElementById('archivoTicketModalBody');
    body.innerHTML = renderTicketDetailHtml(ticket);
    bindPhotoZoom(body);
    detailModal.show();
  }

  function getVisibleTickets() {
    return tickets.filter((t) => matchesSearch(t, searchQuery));
  }

  function updateTotalImporte(visibleTickets) {
    const total = visibleTickets.reduce(
      (sum, t) => sum + (t.totalprecio != null ? Number(t.totalprecio) : 0),
      0
    );
    document.getElementById('archivoTotalImporte').textContent = formatImporte(total);
  }

  function bindRowActions() {
    document.querySelectorAll('.btn-archivo-ver').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        try {
          const ticket = await api.getTicket(id);
          openDetailModal(ticket);
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  function renderTable() {
    const visible = getVisibleTickets();
    updateTotalImporte(visible);

    if (!tickets.length) {
      tableBody.innerHTML =
        `<tr><td colspan="${tableColSpan}" class="text-center text-muted">No hay tickets en el rango seleccionado.</td></tr>`;
      return;
    }

    if (!visible.length) {
      tableBody.innerHTML =
        `<tr><td colspan="${tableColSpan}" class="text-center text-muted">No hay tickets con ese criterio de búsqueda.</td></tr>`;
      return;
    }

    tableBody.innerHTML = visible
      .map((t) => {
        const clienteLabel = t.cliente_empresa || t.cliente_nombre || '—';
        return `
        <tr>
          <td class="text-nowrap">${escapeHtml(formatDate(t.fecha_inicio))}</td>
          <td class="text-nowrap">${escapeHtml(formatDate(t.fecha_fin))}</td>
          <td>${escapeHtml(t.empleado_nombre || 'Sin asignar')}</td>
          <td>${escapeHtml(clienteLabel)}</td>
          <td>${escapeHtml(t.reporte_cliente || '—')}</td>
          <td class="text-end text-nowrap">${
            t.totalprecio != null ? escapeHtml(formatImporte(t.totalprecio)) : '—'
          }</td>
          <td>${statusBadge(t.status)}</td>
          <td class="text-end">
            <button type="button" class="btn btn-outline-primary btn-sm btn-archivo-ver" data-id="${t.id}" title="Ver detalle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </td>
        </tr>`;
      })
      .join('');

    bindRowActions();
  }

  async function exportToExcel() {
    const visible = getVisibleTickets();
    if (!visible.length) {
      toastError('No hay datos para exportar con el filtro actual.');
      return;
    }

    const desde = document.getElementById('archivoDesde').value;
    const hasta = document.getElementById('archivoHasta').value;

    const rows = [
      ['Inicio', 'Fin', 'Empleado', 'Cliente', 'Reporte cliente', 'Importe', 'Status'],
      ...visible.map((t) => [
        formatDate(t.fecha_inicio),
        formatDate(t.fecha_fin),
        t.empleado_nombre || 'Sin asignar',
        t.cliente_empresa || t.cliente_nombre || '',
        t.reporte_cliente || '',
        t.totalprecio != null ? Number(t.totalprecio) : '',
        statusLabel(t.status),
      ]),
    ];

    try {
      await exportRowsToExcel(rows, 'Tickets', `archivo-tickets_${desde}_${hasta}.xlsx`);
      toastSuccess('Archivo Excel generado');
    } catch (err) {
      toastError(err.message || 'No se pudo exportar a Excel.');
    }
  }

  async function loadList() {
    const desde = document.getElementById('archivoDesde').value;
    const hasta = document.getElementById('archivoHasta').value;
    if (!desde || !hasta) return;
    if (desde > hasta) {
      toastError('La fecha inicial no puede ser mayor que la final.');
      return;
    }

    try {
      tickets = await api.listTicketsArchivo(desde, hasta);
      searchQuery = document.getElementById('archivoSearch').value.trim();
      renderTable();
    } catch (err) {
      tableBody.innerHTML =
        `<tr><td colspan="${tableColSpan}" class="text-center text-danger">Error al cargar</td></tr>`;
      document.getElementById('archivoTotalImporte').textContent = formatImporte(0);
      toastError(err.message);
    }
  }

  function onDateFilterChange() {
    loadList();
  }

  document.getElementById('archivoDesde').addEventListener('change', onDateFilterChange);
  document.getElementById('archivoHasta').addEventListener('change', onDateFilterChange);
  document.getElementById('archivoSearch').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderTable();
  });
  document.getElementById('btnArchivoExportar').addEventListener('click', exportToExcel);

  await loadList();
}
