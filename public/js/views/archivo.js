import * as api from '../api.js';
import { renderAppShell, bindLogout } from '../components/layout.js';
import { toastError } from '../alerts.js';
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function statusBadge(status) {
  if (status === 'FINALIZADO') {
    return '<span class="badge badge-estatus-realizado">Finalizado</span>';
  }
  return '<span class="badge badge-estatus-pendiente">Pendiente</span>';
}

function photoUrl(filename) {
  if (!filename) return null;
  return `/FOTOS/${encodeURIComponent(filename)}`;
}

function renderPhotoBlock(label, filename) {
  const url = photoUrl(filename);
  if (!url) {
    return `<div class="mb-2"><span class="text-muted">${escapeHtml(label)}: —</span></div>`;
  }
  return `
    <div class="mb-3">
      <div class="fw-semibold mb-1">${escapeHtml(label)}</div>
      <img src="${url}" alt="${escapeHtml(label)}" class="ticket-archivo-photo img-fluid rounded border">
      <div class="small text-muted mt-1">${escapeHtml(filename)}</div>
    </div>`;
}

export async function renderArchivo(root) {
  const { start, end } = monthRange();
  let tickets = [];
  let detailModal = null;

  root.innerHTML = `
    ${renderAppShell('archivo', 'Archivo')}
    <main class="container-fluid py-2 cotizaciones-page">
      <div class="card border-0 shadow-sm">
        <div class="card-header card-header-app py-2">
          <h2 class="h6 mb-0"><i class="fa-solid fa-box-archive me-2"></i>Archivo de tickets</h2>
        </div>
        <div class="card-body py-2">
          <form id="filtroArchivoForm" class="row g-2 align-items-end mb-2">
            <div class="col-md-5">
              <label class="form-label" for="archivoDesde">Desde</label>
              <input type="date" class="form-control form-control-sm" id="archivoDesde" value="${start}" required>
            </div>
            <div class="col-md-5">
              <label class="form-label" for="archivoHasta">Hasta</label>
              <input type="date" class="form-control form-control-sm" id="archivoHasta" value="${end}" required>
            </div>
            <div class="col-md-2">
              <button type="submit" class="btn btn-primary btn-sm w-100">
                <i class="fa-solid fa-magnifying-glass me-1"></i>Buscar
              </button>
            </div>
          </form>
          <div class="table-responsive cotizaciones-list-wrap">
            <table class="table table-sm table-hover small mb-0">
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Empleado</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody id="archivoTableBody">
                <tr><td colspan="6" class="text-center text-muted">Cargando...</td></tr>
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
    document.getElementById('archivoTicketModalBody').innerHTML = `
      <dl class="row mb-3 small">
        <dt class="col-sm-3">Fecha inicio</dt><dd class="col-sm-9">${escapeHtml(formatDate(ticket.fecha_inicio))}</dd>
        <dt class="col-sm-3">Fecha fin</dt><dd class="col-sm-9">${escapeHtml(formatDate(ticket.fecha_fin))}</dd>
        <dt class="col-sm-3">Empleado</dt><dd class="col-sm-9">${escapeHtml(ticket.empleado_nombre || 'Sin asignar')}</dd>
        <dt class="col-sm-3">Cliente</dt><dd class="col-sm-9">${escapeHtml(ticket.cliente_empresa || ticket.cliente_nombre || '—')}</dd>
        <dt class="col-sm-3">Status</dt><dd class="col-sm-9">${statusBadge(ticket.status)}</dd>
        <dt class="col-sm-3">Reporte cliente</dt><dd class="col-sm-9">${escapeHtml(ticket.reporte_cliente || '—')}</dd>
        <dt class="col-sm-3">Reporte técnico</dt><dd class="col-sm-9">${escapeHtml(ticket.reporte_tecnico || '—')}</dd>
        <dt class="col-sm-3">Accesos</dt><dd class="col-sm-9">${escapeHtml(ticket.accesos || '—')}</dd>
        <dt class="col-sm-3">Notas</dt><dd class="col-sm-9">${escapeHtml(ticket.notas || '—')}</dd>
      </dl>
      ${renderPhotoBlock('Foto 1', ticket.foto1)}
      ${renderPhotoBlock('Foto 2', ticket.foto2)}
      ${renderPhotoBlock('Foto 3', ticket.foto3)}
    `;
    detailModal.show();
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
    if (!tickets.length) {
      tableBody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted">No hay tickets en el rango seleccionado.</td></tr>';
      return;
    }

    tableBody.innerHTML = tickets
      .map((t) => {
        const clienteLabel = t.cliente_empresa || t.cliente_nombre || '—';
        return `
        <tr>
          <td class="text-nowrap">${escapeHtml(formatDate(t.fecha_inicio))}</td>
          <td class="text-nowrap">${escapeHtml(formatDate(t.fecha_fin))}</td>
          <td>${escapeHtml(t.empleado_nombre || 'Sin asignar')}</td>
          <td>${escapeHtml(clienteLabel)}</td>
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

  async function loadList() {
    const desde = document.getElementById('archivoDesde').value;
    const hasta = document.getElementById('archivoHasta').value;
    if (!desde || !hasta) {
      toastError('Seleccione el rango de fechas.');
      return;
    }
    if (desde > hasta) {
      toastError('La fecha inicial no puede ser mayor que la final.');
      return;
    }

    try {
      tickets = await api.listTicketsArchivo(desde, hasta);
      renderTable();
    } catch (err) {
      tableBody.innerHTML =
        '<tr><td colspan="6" class="text-center text-danger">Error al cargar</td></tr>';
      toastError(err.message);
    }
  }

  document.getElementById('filtroArchivoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    loadList();
  });

  await loadList();
}
