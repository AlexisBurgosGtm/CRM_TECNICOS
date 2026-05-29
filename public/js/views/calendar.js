import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { isSupervisor } from '../auth.js';
import { toastError, toastWarning } from '../alerts.js';
import { formatDate } from '../format.js';

let calendar = null;
let filterEmpleado = '';
let filterEstatus = 'pendiente';

const DEFAULT_COLOR = '#7c3aed';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addOneDay(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return toDateInput(d);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function eventTitle(ticket) {
  const prefix = ticket.estatus === 'realizado' ? '✓ ' : '';
  return `${prefix}${ticket.empleado_nombre}`;
}

function mapCalendarEvent(ticket) {
  const endExclusive = addOneDay(ticket.fin || ticket.inicio);
  return {
    id: String(ticket.id),
    title: eventTitle(ticket),
    start: ticket.inicio,
    end: endExclusive,
    allDay: true,
    backgroundColor: '#ffffff',
    borderColor: ticket.empleado_color || DEFAULT_COLOR,
    textColor: '#000000',
    classNames: ['fc-event-outline'],
    extendedProps: ticket,
  };
}

function applyFilters(tickets) {
  let list = tickets;
  if (filterEmpleado) {
    list = list.filter((t) => String(t.empleado_codigo) === filterEmpleado);
  }
  if (filterEstatus) {
    list = list.filter((t) => t.estatus === filterEstatus);
  }
  return list;
}

export function destroyCalendar() {
  if (calendar) {
    calendar.destroy();
    calendar = null;
  }
  filterEmpleado = '';
  filterEstatus = 'pendiente';
}

export async function renderCalendar(root) {
  updateAppShell('calendario', 'Calendario');
  const supervisor = isSupervisor();

  root.innerHTML = `
    <main class="container-fluid py-2">
      <div class="row g-2 mb-2 align-items-end calendar-filters">
        ${
          supervisor
            ? `
        <div class="col-md-6">
          <label class="form-label" for="filtroCalEmpleado">Empleado</label>
          <select class="form-select form-select-sm" id="filtroCalEmpleado">
            <option value="">Todos los empleados activos</option>
          </select>
        </div>`
            : ''
        }
        <div class="col-md-${supervisor ? '6' : '12'}">
          <label class="form-label" for="filtroCalEstatus">Estatus</label>
          <select class="form-select form-select-sm" id="filtroCalEstatus">
            <option value="pendiente" selected>Pendientes</option>
            <option value="realizado">Realizados</option>
          </select>
        </div>
      </div>
      <div id="calendar"></div>
    </main>
    <div class="modal fade" id="ticketCalModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="ticketCalModalLabel">Ticket</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body py-2" id="ticketCalModalBody"></div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await bindLogout();

  const ticketCalModal = new bootstrap.Modal(document.getElementById('ticketCalModal'));
  const filtroCalEmpleado = document.getElementById('filtroCalEmpleado');
  const filtroCalEstatus = document.getElementById('filtroCalEstatus');

  async function loadEmpleadoFilter() {
    if (!supervisor || !filtroCalEmpleado) return;
    const empleados = await api.listEmpleados(true);
    const empOptions = empleados
      .map((e) => `<option value="${e.codigo}">${escapeHtml(e.nombre)} (${e.telefono})</option>`)
      .join('');
    filtroCalEmpleado.innerHTML =
      '<option value="">Todos los empleados activos</option>' + empOptions;
    if (empleados.length === 0) toastWarning('Registre empleados activos en la sección Empleados.');
  }

  function openTicketModal(ticket) {
    const estatusLabel = ticket.estatus === 'realizado' ? 'Finalizado' : 'Pendiente';
    document.getElementById('ticketCalModalLabel').textContent = `Ticket #${ticket.id}`;
    document.getElementById('ticketCalModalBody').innerHTML = `
      <dl class="row mb-0 small">
        <dt class="col-sm-4">Fecha inicio</dt>
        <dd class="col-sm-8">${escapeHtml(formatDate(ticket.inicio))}</dd>
        <dt class="col-sm-4">Empleado</dt>
        <dd class="col-sm-8">${escapeHtml(ticket.empleado_nombre)}</dd>
        <dt class="col-sm-4">Nombre empresa</dt>
        <dd class="col-sm-8">${escapeHtml(ticket.cliente_empresa || '—')}</dd>
        <dt class="col-sm-4">Nombre cliente</dt>
        <dd class="col-sm-8">${escapeHtml(ticket.cliente_nombre || '—')}</dd>
        <dt class="col-sm-4">Teléfono cliente</dt>
        <dd class="col-sm-8">${escapeHtml(ticket.cliente_telefono || '—')}</dd>
        <dt class="col-sm-4">Estatus</dt>
        <dd class="col-sm-8">${escapeHtml(estatusLabel)}</dd>
        <dt class="col-sm-4">Reporte cliente</dt>
        <dd class="col-sm-8">${escapeHtml(ticket.reporte_cliente || '—')}</dd>
        <dt class="col-sm-4">Accesos</dt>
        <dd class="col-sm-8">${escapeHtml(ticket.accesos || '—')}</dd>
        <dt class="col-sm-4">Notas</dt>
        <dd class="col-sm-8">${escapeHtml(ticket.notas || '—')}</dd>
      </dl>
    `;
    ticketCalModal.show();
  }

  function refetchCalendar() {
    if (calendar) calendar.refetchEvents();
  }

  if (filtroCalEmpleado) {
    filtroCalEmpleado.addEventListener('change', () => {
      filterEmpleado = filtroCalEmpleado.value;
      refetchCalendar();
    });
  }

  filtroCalEstatus.value = filterEstatus;
  filtroCalEstatus.addEventListener('change', () => {
    filterEstatus = filtroCalEstatus.value;
    refetchCalendar();
  });

  destroyCalendar();
  calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    themeSystem: 'bootstrap5',
    locale: 'es',
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek',
    },
    height: 'auto',
    selectable: false,
    events: async (info, success, failure) => {
      try {
        const tickets = await api.listTicketsCalendar(info.startStr, info.endStr);
        success(applyFilters(tickets).map(mapCalendarEvent));
      } catch (err) {
        failure(err);
        toastError(err.message);
      }
    },
    eventClick(info) {
      openTicketModal(info.event.extendedProps);
    },
  });
  calendar.render();

  await loadEmpleadoFilter();
}
