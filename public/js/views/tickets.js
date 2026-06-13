import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { isSupervisor } from '../auth.js';
import { toastSuccess, toastError, confirmDeleteWithClave } from '../alerts.js';
import { formatDate } from '../format.js';
import {
  renderTicketDetailHtml,
  bindPhotoZoom,
  bindTicketDetailImageDownload,
} from '../components/ticket-detail.js';
import { setBtnLoading, runFormAction, runButtonAction } from '../form-actions.js';
import { mountFloatingFab } from '../components/fab.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function truncate(text, max = 100) {
  if (!text) return '—';
  const value = String(text);
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function empleadoLabel(ticket) {
  return ticket.empleado_nombre && ticket.empleado_nombre !== 'Sin asignar'
    ? ticket.empleado_nombre
    : 'Sin asignar';
}

function daysElapsed(fechaInicio) {
  if (!fechaInicio) return 0;
  const start = new Date(`${fechaInicio}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((today - start) / 86400000);
  return Math.max(0, diff);
}

function daysBadgeClass(days) {
  if (days <= 1) return 'ticket-dias-verde';
  if (days === 2) return 'ticket-dias-amarillo';
  return 'ticket-dias-rojo';
}

function daysLabel(days) {
  return `${days} día${days === 1 ? '' : 's'}`;
}

function prioridadBadgeClass(prioridad) {
  const value = String(prioridad || 'MEDIA').toUpperCase();
  if (value === 'ALTA') return 'ticket-prioridad-alta';
  if (value === 'BAJA') return 'ticket-prioridad-baja';
  return 'ticket-prioridad-media';
}

function prioridadLabel(prioridad) {
  const value = String(prioridad || 'MEDIA').toUpperCase();
  if (value === 'ALTA') return 'Alta';
  if (value === 'BAJA') return 'Baja';
  return 'Media';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const FINALIZAR_PHOTO_SLOTS = [
  { slot: 1, inputId: 'finalizarFoto1Input', btnId: 'finalizarFoto1Btn', statusId: 'finalizarFoto1Status' },
  { slot: 2, inputId: 'finalizarFoto2Input', btnId: 'finalizarFoto2Btn', statusId: 'finalizarFoto2Status' },
  { slot: 3, inputId: 'finalizarFoto3Input', btnId: 'finalizarFoto3Btn', statusId: 'finalizarFoto3Status' },
];

function setFinalizarPhotoStatus(statusEl, message, variant = 'muted') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `small text-${variant}`;
}

function setFinalizarPhotoBtnLoading(btn, loading) {
  setBtnLoading(btn, loading);
}

function photoLoadedLabel(value) {
  if (!value) return '';
  if (String(value).startsWith('data:')) return 'Cargada';
  return `Cargada: ${value}`;
}

function initFinalizarPhotoStatus(ticket) {
  FINALIZAR_PHOTO_SLOTS.forEach(({ slot, statusId }) => {
    const status = document.getElementById(statusId);
    const photo = ticket[`foto${slot}`];
    if (photo) {
      setFinalizarPhotoStatus(status, photoLoadedLabel(photo), 'success');
    } else {
      setFinalizarPhotoStatus(status, '', 'muted');
    }
  });
}

function bindFinalizarPhotoUploads() {
  FINALIZAR_PHOTO_SLOTS.forEach(({ slot, inputId, btnId, statusId }) => {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    const status = document.getElementById(statusId);
    if (!input || !btn) return;

    btn.addEventListener('click', () => {
      if (!btn.disabled) input.click();
    });

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;

      const ticketId = Number(document.getElementById('finalizarTicketId').value);
      setFinalizarPhotoBtnLoading(btn, true);
      input.disabled = true;
      setFinalizarPhotoStatus(status, 'Cargando…', 'primary');

      try {
        const data = await readFileAsDataUrl(file);
        const updated = await api.uploadTicketFoto(ticketId, slot, { name: file.name, data });
        setFinalizarPhotoStatus(
          status,
          photoLoadedLabel(updated[`foto${slot}`]) || 'Cargada',
          'success'
        );
        toastSuccess(`Foto ${slot} cargada`);
      } catch (err) {
        toastError(err.message);
        setFinalizarPhotoStatus(status, '', 'muted');
      } finally {
        setFinalizarPhotoBtnLoading(btn, false);
        input.disabled = false;
        input.value = '';
      }
    });
  });
}

function matchesSearch(ticket, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    ticket.fecha_inicio,
    ticket.empleado_nombre,
    ticket.cliente_empresa,
    ticket.cliente_nombre,
    ticket.reporte_cliente,
    ticket.prioridad,
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  return haystack.includes(q);
}

function mountTicketsFab() {
  return mountFloatingFab({ id: 'btnFabNuevoTicket', ariaLabel: 'Nuevo ticket' });
}

export async function renderTickets(root) {
  updateAppShell('tickets', 'Tickets');
  const supervisor = isSupervisor();
  let tickets = [];
  let searchQuery = '';
  let ticketModal = null;
  let finalizarModal = null;
  let asignarModal = null;
  let empleadosActivos = [];

  root.innerHTML = `
    <main class="container-fluid py-2 cotizaciones-page">
      <div class="card border-0 shadow-sm">
        <div class="card-header card-header-app py-2">
          <h2 class="h6 mb-0"><i class="fa-solid fa-ticket me-2"></i>Tickets pendientes</h2>
        </div>
        <div class="card-body py-2">
          <div class="mb-2">
            <label class="form-label visually-hidden" for="ticketSearch">Buscar tickets</label>
            <input type="search" class="form-control form-control-sm" id="ticketSearch"
              placeholder="Buscar en la tabla…" autocomplete="off">
          </div>
          <div class="table-responsive cotizaciones-list-wrap">
            <table class="table table-sm table-hover small mb-0 tickets-stack-table">
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Empleado</th>
                  <th>Cliente</th>
                  <th>Reporte cliente</th>
                  <th>Prioridad</th>
                  <th>Días</th>
                  <th class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody id="ticketsTableBody">
                <tr><td colspan="7" class="text-center text-muted">Cargando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
    <div class="modal fade" id="ticketModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="ticketModalLabel">Nuevo ticket</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="ticketForm" class="modal-body py-2">
            <input type="hidden" id="ticketId">
            <div class="mb-2">
              <label class="form-label" for="ticketFechaInicio">Fecha inicio</label>
              <input type="date" class="form-control form-control-sm" id="ticketFechaInicio" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="ticketEmpleado">Empleado</label>
              <select class="form-select form-select-sm" id="ticketEmpleado">
                <option value="">Sin asignar</option>
              </select>
            </div>
            <div class="mb-2">
              <label class="form-label" for="ticketCliente">Cliente</label>
              <select class="form-select form-select-sm" id="ticketCliente" required></select>
            </div>
            <div class="mb-2" id="ticketPrioridadGroup">
              <label class="form-label" for="ticketPrioridad">Prioridad</label>
              <select class="form-select form-select-sm" id="ticketPrioridad" required>
                <option value="ALTA">Alta</option>
                <option value="MEDIA" selected>Media</option>
                <option value="BAJA">Baja</option>
              </select>
            </div>
            <div class="mb-2">
              <label class="form-label" for="ticketReporteCliente">Reporte cliente</label>
              <textarea class="form-control form-control-sm" id="ticketReporteCliente" rows="4"></textarea>
            </div>
            <div class="mb-2" id="ticketTotalPrecioGroup">
              <label class="form-label" for="ticketTotalPrecio">Total precio</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">Q</span>
                <input type="number" class="form-control form-control-sm" id="ticketTotalPrecio" min="0" step="0.01">
              </div>
            </div>
          </form>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" form="ticketForm" class="btn btn-primary btn-sm">Guardar</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal fade" id="asignarTicketModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="asignarTicketModalLabel">Asignar empleado</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="asignarTicketForm" class="modal-body py-2">
            <input type="hidden" id="asignarTicketId">
            <div class="mb-2">
              <label class="form-label" for="asignarTicketEmpleado">Empleado</label>
              <select class="form-select form-select-sm" id="asignarTicketEmpleado" required></select>
            </div>
          </form>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" form="asignarTicketForm" class="btn btn-primary btn-sm">Asignar</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal fade" id="finalizarTicketModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="finalizarTicketModalLabel">Finalizar ticket</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="finalizarTicketForm" class="modal-body py-2">
            <input type="hidden" id="finalizarTicketId">
            <div class="mb-2">
              <label class="form-label" for="finalizarFechaFin">Fecha fin</label>
              <input type="date" class="form-control form-control-sm" id="finalizarFechaFin" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="finalizarTotalPrecio">Total precio</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text">Q</span>
                <input type="number" class="form-control form-control-sm" id="finalizarTotalPrecio" min="0" step="0.01">
              </div>
            </div>
            <div class="mb-2">
              <label class="form-label" for="finalizarReporteTecnico">Reporte técnico</label>
              <textarea class="form-control form-control-sm" id="finalizarReporteTecnico" rows="4"></textarea>
            </div>
            <div class="mb-2">
              <label class="form-label" for="finalizarAccesos">Accesos</label>
              <input type="text" class="form-control form-control-sm" id="finalizarAccesos" maxlength="255">
            </div>
            <div class="mb-2">
              <label class="form-label" for="finalizarNotas">Notas</label>
              <textarea class="form-control form-control-sm" id="finalizarNotas" rows="3"></textarea>
            </div>
            <div class="mb-2">
              <label class="form-label" for="finalizarInsumos">Insumos</label>
              <textarea class="form-control form-control-sm" id="finalizarInsumos" rows="3"></textarea>
            </div>
            <div class="mb-2">
              <label class="form-label">Foto 1</label>
              <input type="file" class="d-none" id="finalizarFoto1Input" accept="image/*">
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <button type="button" class="btn btn-outline-primary btn-sm" id="finalizarFoto1Btn">
                  <i class="fa-solid fa-upload me-1"></i>Cargar foto 1
                </button>
                <span class="small text-muted" id="finalizarFoto1Status"></span>
              </div>
            </div>
            <div class="mb-2">
              <label class="form-label">Foto 2</label>
              <input type="file" class="d-none" id="finalizarFoto2Input" accept="image/*">
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <button type="button" class="btn btn-outline-primary btn-sm" id="finalizarFoto2Btn">
                  <i class="fa-solid fa-upload me-1"></i>Cargar foto 2
                </button>
                <span class="small text-muted" id="finalizarFoto2Status"></span>
              </div>
            </div>
            <div class="mb-2">
              <label class="form-label">Foto 3</label>
              <input type="file" class="d-none" id="finalizarFoto3Input" accept="image/*">
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <button type="button" class="btn btn-outline-primary btn-sm" id="finalizarFoto3Btn">
                  <i class="fa-solid fa-upload me-1"></i>Cargar foto 3
                </button>
                <span class="small text-muted" id="finalizarFoto3Status"></span>
              </div>
            </div>
          </form>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" form="finalizarTicketForm" class="btn btn-success btn-sm">Finalizar</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal fade" id="ticketsDetailModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable modal-lg">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="ticketsDetailModalLabel">Detalle del ticket</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body py-2" id="ticketsDetailModalBody"></div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-outline-primary btn-sm" id="ticketsDetailDownloadBtn">
              <i class="fa-solid fa-download me-1"></i>Descargar imagen
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await bindLogout();

  const tableBody = document.getElementById('ticketsTableBody');
  const colSpan = 7;
  let bindSupervisorRowActions = () => {};
  const detailModal = new bootstrap.Modal(document.getElementById('ticketsDetailModal'));
  const ticketsDetailModalContent = document.querySelector('#ticketsDetailModal .modal-content');
  const ticketsDetailDownloadBtn = document.getElementById('ticketsDetailDownloadBtn');
  bindTicketDetailImageDownload(ticketsDetailDownloadBtn, ticketsDetailModalContent);

  function detailButtonHtml(id) {
    return `<button type="button" class="btn btn-outline-info btn-sm btn-ticket-detalle" data-id="${id}" title="Ver detalle">
              <i class="fa-solid fa-eye"></i>
            </button>`;
  }

  function mapsButtonHtml(ticket) {
    const lat = ticket.cliente_latitud;
    const lng = ticket.cliente_longitud;
    const hasCoords =
      lat != null &&
      lng != null &&
      Number.isFinite(Number(lat)) &&
      Number.isFinite(Number(lng));
    if (!hasCoords) {
      return `<button type="button" class="btn btn-outline-secondary btn-sm" disabled title="Sin ubicación del cliente">
                <i class="fa-solid fa-location-dot"></i>
              </button>`;
    }
    return `<button type="button" class="btn btn-outline-secondary btn-sm btn-ticket-maps" data-lat="${lat}" data-lng="${lng}" title="Abrir en Google Maps">
              <i class="fa-solid fa-location-dot"></i>
            </button>`;
  }

  function bindMapsActions() {
    document.querySelectorAll('.btn-ticket-maps').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lat = btn.dataset.lat;
        const lng = btn.dataset.lng;
        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    });
  }

  function openDetailModal(ticket) {
    document.getElementById('ticketsDetailModalLabel').textContent = `Ticket #${ticket.id}`;
    const body = document.getElementById('ticketsDetailModalBody');
    body.innerHTML = renderTicketDetailHtml(ticket);
    ticketsDetailDownloadBtn.dataset.ticketId = ticket.id;
    bindPhotoZoom(body);
    detailModal.show();
  }

  function bindDetailActions() {
    document.querySelectorAll('.btn-ticket-detalle').forEach((btn) => {
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
    const visible = tickets.filter((t) => matchesSearch(t, searchQuery));

    if (!visible.length) {
      tableBody.innerHTML =
        `<tr><td colspan="${colSpan}" class="text-center text-muted">No hay tickets pendientes con ese criterio.</td></tr>`;
      return;
    }

    tableBody.innerHTML = visible
      .map((t) => {
        const days = daysElapsed(t.fecha_inicio);
        const clienteLabel = t.cliente_empresa || t.cliente_nombre || '—';
        const actionsCell = supervisor
          ? `<td class="text-end text-nowrap ticket-row-actions" data-label="Acciones">
            <button type="button" class="btn btn-outline-secondary btn-sm btn-ticket-asignar" data-id="${t.id}" title="Asignar empleado">
              <i class="fa-solid fa-user"></i>
            </button>
            <button type="button" class="btn btn-outline-primary btn-sm btn-ticket-edit" data-id="${t.id}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            ${mapsButtonHtml(t)}
            ${detailButtonHtml(t.id)}
            <button type="button" class="btn btn-outline-success btn-sm btn-ticket-finalizar" data-id="${t.id}" title="Finalizar">
              <i class="fa-solid fa-check me-1"></i>Finalizar
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-ticket-delete" data-id="${t.id}" title="Eliminar">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>`
          : `<td class="text-end text-nowrap ticket-row-actions" data-label="Acciones">
            ${mapsButtonHtml(t)}
            ${detailButtonHtml(t.id)}
            <button type="button" class="btn btn-outline-success btn-sm btn-ticket-finalizar" data-id="${t.id}" title="Finalizar">
              <i class="fa-solid fa-check me-1"></i>Finalizar
            </button>
          </td>`;
        return `
        <tr>
          <td class="text-nowrap" data-label="Inicio">${escapeHtml(formatDate(t.fecha_inicio))}</td>
          <td data-label="Empleado">${escapeHtml(empleadoLabel(t))}</td>
          <td data-label="Cliente">${escapeHtml(clienteLabel)}</td>
          <td class="ticket-reporte-cell" data-label="Reporte cliente">${escapeHtml(truncate(t.reporte_cliente))}</td>
          <td data-label="Prioridad"><span class="badge ${prioridadBadgeClass(t.prioridad)}">${escapeHtml(prioridadLabel(t.prioridad))}</span></td>
          <td data-label="Días"><span class="badge ${daysBadgeClass(days)}">${daysLabel(days)}</span></td>
          ${actionsCell}
        </tr>`;
      })
      .join('');

    bindDetailActions();
    bindMapsActions();
    bindFinalizarActions();
    if (supervisor) bindSupervisorRowActions();
  }

  finalizarModal = new bootstrap.Modal(document.getElementById('finalizarTicketModal'));
  bindFinalizarPhotoUploads();

  function openFinalizarModal(ticket) {
    document.getElementById('finalizarTicketForm').reset();
    document.getElementById('finalizarTicketModalLabel').textContent = `Finalizar ticket #${ticket.id}`;
    document.getElementById('finalizarTicketId').value = ticket.id;
    document.getElementById('finalizarFechaFin').value = toDateInput(new Date());
    document.getElementById('finalizarTotalPrecio').value =
      ticket.totalprecio != null ? ticket.totalprecio : '';
    document.getElementById('finalizarReporteTecnico').value = ticket.reporte_tecnico || '';
    document.getElementById('finalizarAccesos').value = ticket.accesos || '';
    document.getElementById('finalizarNotas').value = ticket.notas || '';
    document.getElementById('finalizarInsumos').value = ticket.insumos || '';
    initFinalizarPhotoStatus(ticket);
    finalizarModal.show();
  }

  function bindFinalizarActions() {
    document.querySelectorAll('.btn-ticket-finalizar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        try {
          const ticket = await api.getTicket(id);
          openFinalizarModal(ticket);
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  document.getElementById('finalizarTicketForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await runFormAction('finalizarTicketForm', 'Finalizando…', async () => {
      const id = Number(document.getElementById('finalizarTicketId').value);
      const totalVal = document.getElementById('finalizarTotalPrecio').value.trim();
      const body = {
        fecha_fin: document.getElementById('finalizarFechaFin').value,
        totalprecio: totalVal !== '' ? Number(totalVal) : null,
        reporte_tecnico: document.getElementById('finalizarReporteTecnico').value.trim() || null,
        accesos: document.getElementById('finalizarAccesos').value.trim() || null,
        notas: document.getElementById('finalizarNotas').value.trim() || null,
        insumos: document.getElementById('finalizarInsumos').value.trim() || null,
      };
      try {
        await api.finalizarTicket(id, body);
        finalizarModal.hide();
        toastSuccess('Ticket finalizado');
        await loadList();
      } catch (err) {
        toastError(err.message);
      }
    });
  });

  if (supervisor) {
    ticketModal = new bootstrap.Modal(document.getElementById('ticketModal'));
    asignarModal = new bootstrap.Modal(document.getElementById('asignarTicketModal'));

    const empleadoSelect = document.getElementById('ticketEmpleado');
    const clienteSelect = document.getElementById('ticketCliente');
    const asignarEmpleadoSelect = document.getElementById('asignarTicketEmpleado');

    async function loadSelects() {
      const [empleados, clientes] = await Promise.all([api.listEmpleados(true), api.listClientes()]);
      empleadosActivos = empleados;
      const empOptions = empleados.map((e) => `<option value="${e.codigo}">${escapeHtml(e.nombre)}</option>`).join('');
      empleadoSelect.innerHTML = '<option value="">Sin asignar</option>' + empOptions;
      asignarEmpleadoSelect.innerHTML =
        '<option value="">Seleccione empleado</option>' + empOptions;
      clienteSelect.innerHTML =
        '<option value="">Seleccione cliente</option>' +
        clientes
          .map(
            (c) =>
              `<option value="${c.codigo}">${escapeHtml(c.nombre_empresa)} — ${escapeHtml(c.nombre_cliente)}</option>`
          )
          .join('');
    }

    function openCreateModal() {
      const today = toDateInput(new Date());
      document.getElementById('ticketForm').reset();
      document.getElementById('ticketId').value = '';
      document.getElementById('ticketModalLabel').textContent = 'Nuevo ticket';
      document.getElementById('ticketFechaInicio').value = today;
      document.getElementById('ticketTotalPrecioGroup').classList.remove('d-none');
      document.getElementById('ticketPrioridadGroup').classList.remove('d-none');
      document.getElementById('ticketPrioridad').value = 'MEDIA';
      document.getElementById('ticketTotalPrecio').value = '';
      empleadoSelect.innerHTML =
        '<option value="">Sin asignar</option>' +
        empleadosActivos.map((e) => `<option value="${e.codigo}">${escapeHtml(e.nombre)}</option>`).join('');
      ticketModal.show();
    }

    function openEditModal(ticket) {
      document.getElementById('ticketModalLabel').textContent = `Editar ticket #${ticket.id}`;
      document.getElementById('ticketId').value = ticket.id;
      document.getElementById('ticketFechaInicio').value = ticket.fecha_inicio;
      empleadoSelect.value = ticket.codigo_empleado ? String(ticket.codigo_empleado) : '';
      document.getElementById('ticketCliente').value = String(ticket.codigo_cliente);
      document.getElementById('ticketReporteCliente').value = ticket.reporte_cliente || '';
      document.getElementById('ticketTotalPrecioGroup').classList.add('d-none');
      document.getElementById('ticketPrioridadGroup').classList.add('d-none');
      ticketModal.show();
    }

    function openAsignarModal(ticket) {
      document.getElementById('asignarTicketId').value = ticket.id;
      document.getElementById('asignarTicketModalLabel').textContent = `Asignar empleado — ticket #${ticket.id}`;
      asignarEmpleadoSelect.value = ticket.codigo_empleado ? String(ticket.codigo_empleado) : '';
      asignarModal.show();
    }

    bindSupervisorRowActions = function () {
      document.querySelectorAll('.btn-ticket-asignar').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.dataset.id);
          try {
            const ticket = await api.getTicket(id);
            openAsignarModal(ticket);
          } catch (err) {
            toastError(err.message);
          }
        });
      });

      document.querySelectorAll('.btn-ticket-edit').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.dataset.id);
          try {
            const ticket = await api.getTicket(id);
            openEditModal(ticket);
          } catch (err) {
            toastError(err.message);
          }
        });
      });

      document.querySelectorAll('.btn-ticket-delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.dataset.id);
          const clave = await confirmDeleteWithClave('Eliminar ticket', '¿Confirma la eliminación?');
          if (!clave) return;
          await runButtonAction(
            btn,
            async () => {
              try {
                await api.deleteTicket(id, clave);
                toastSuccess('Ticket eliminado');
                await loadList();
              } catch (err) {
                toastError(err.message);
              }
            },
            { iconOnly: true }
          );
        });
      });
    };

    const fabBtn = mountTicketsFab();
    fabBtn.addEventListener('click', openCreateModal);

    document.getElementById('ticketForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('ticketId').value;
      const loadingText = id ? 'Guardando…' : 'Creando…';
      await runFormAction('ticketForm', loadingText, async () => {
        const empleadoVal = document.getElementById('ticketEmpleado').value;
        const body = {
          fecha_inicio: document.getElementById('ticketFechaInicio').value,
          codigo_empleado: empleadoVal ? Number(empleadoVal) : null,
          codigo_cliente: Number(document.getElementById('ticketCliente').value),
          reporte_cliente: document.getElementById('ticketReporteCliente').value.trim() || null,
        };
        if (!id) {
          body.status = 'PENDIENTE';
          body.prioridad = document.getElementById('ticketPrioridad').value;
          const totalVal = document.getElementById('ticketTotalPrecio').value.trim();
          if (totalVal !== '') body.totalprecio = Number(totalVal);
        }

        try {
          if (id) {
            await api.updateTicket({ id: Number(id), ...body });
            toastSuccess('Ticket actualizado');
          } else {
            await api.createTicket(body);
            toastSuccess('Ticket creado');
          }
          ticketModal.hide();
          await loadList();
        } catch (err) {
          toastError(err.message);
        }
      });
    });

    document.getElementById('asignarTicketForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      await runFormAction('asignarTicketForm', 'Asignando…', async () => {
        const id = Number(document.getElementById('asignarTicketId').value);
        const codigo_empleado = Number(document.getElementById('asignarTicketEmpleado').value);
        try {
          await api.assignTicketEmpleado(id, codigo_empleado);
          asignarModal.hide();
          toastSuccess('Empleado asignado');
          await loadList();
        } catch (err) {
          toastError(err.message);
        }
      });
    });

    await loadSelects();
  }

  async function loadList() {
    try {
      tickets = await api.listTickets();
      renderTable();
    } catch (err) {
      tableBody.innerHTML =
        `<tr><td colspan="${colSpan}" class="text-center text-danger">Error al cargar</td></tr>`;
      toastError(err.message);
    }
  }

  document.getElementById('ticketSearch').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderTable();
  });

  await loadList();
}
