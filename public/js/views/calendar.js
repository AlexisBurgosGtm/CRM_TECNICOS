import * as api from '../api.js';
import { renderAppShell, bindLogout } from '../components/layout.js';
import { isSupervisor } from '../auth.js';
import {
  toastSuccess,
  toastError,
  toastWarning,
  confirmAction,
  promptTotalPrecio,
} from '../alerts.js';

let calendar = null;
let filterEmpleado = '';
let filterEstatus = 'pendiente';

const DEFAULT_COLOR = '#7c3aed';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDatetimeLocalFromDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDatetimeLocal(iso) {
  if (!iso) return '';
  return toDatetimeLocalFromDate(new Date(iso));
}

function fromDatetimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function clienteLabel(c) {
  return `${c.nombre_empresa} — ${c.nombre_cliente}`;
}

function eventTitle(e) {
  const cliente = e.cliente_empresa || 'Sin cliente';
  const prefix = e.estatus === 'realizado' ? '✓ ' : '';
  return `${prefix}${e.titulo} — ${e.empleado_nombre} / ${cliente}`;
}

function mapCalendarEvent(e) {
  const borderColor = e.empleado_color || DEFAULT_COLOR;
  return {
    id: String(e.id),
    title: eventTitle(e),
    start: e.inicio,
    end: e.fin,
    backgroundColor: '#ffffff',
    borderColor,
    textColor: '#000000',
    classNames: ['fc-event-outline'],
    extendedProps: e,
  };
}

function applyFilters(eventos) {
  let list = eventos;
  if (filterEmpleado) {
    list = list.filter((e) => String(e.empleado_codigo) === filterEmpleado);
  }
  if (filterEstatus) {
    list = list.filter((e) => e.estatus === filterEstatus);
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
  const supervisor = isSupervisor();

  root.innerHTML = `
    ${renderAppShell('calendario', 'Calendario')}
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
    <div class="modal fade" id="eventoModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="eventoModalLabel">Evento</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="eventoForm" class="modal-body py-2">
            <input type="hidden" id="eventoId">
            <div class="mb-2">
              <label class="form-label" for="eventoTitulo">Título</label>
              <input type="text" class="form-control form-control-sm" id="eventoTitulo" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="eventoEmpleado">Empleado</label>
              <select class="form-select form-select-sm" id="eventoEmpleado" required></select>
            </div>
            <div class="mb-2">
              <label class="form-label" for="eventoCliente">Cliente</label>
              <select class="form-select form-select-sm" id="eventoCliente" required></select>
            </div>
            <div class="mb-2">
              <label class="form-label" for="eventoInicio">Inicio</label>
              <input type="datetime-local" class="form-control form-control-sm" id="eventoInicio" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="eventoFin">Fin</label>
              <input type="datetime-local" class="form-control form-control-sm" id="eventoFin" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="eventoObservaciones">Observaciones</label>
              <textarea class="form-control form-control-sm" id="eventoObservaciones" rows="3"></textarea>
            </div>
            <div class="mb-2" id="eventoEstatusGroup">
              <label class="form-label" for="eventoEstatus">Estatus</label>
              <select class="form-select form-select-sm" id="eventoEstatus" required>
                <option value="pendiente">Pendiente</option>
                <option value="realizado">Realizado</option>
              </select>
            </div>
            <div class="mb-2 d-none" id="eventoPreciosGroup">
              <div class="row g-2">
                <div class="col-6">
                  <label class="form-label" for="eventoCotizado">Cotizado</label>
                  <input type="number" class="form-control form-control-sm" id="eventoCotizado" min="0" step="0.01">
                </div>
                <div class="col-6">
                  <label class="form-label" for="eventoTotalPrecio">Total precio</label>
                  <input type="number" class="form-control form-control-sm" id="eventoTotalPrecio" min="0" step="0.01">
                </div>
              </div>
            </div>
          </form>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-danger btn-sm d-none" id="btnEliminarEvento">Eliminar</button>
            <button type="submit" form="eventoForm" class="btn btn-primary btn-sm d-none" id="btnGuardarEvento">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await bindLogout();

  const eventoModal = new bootstrap.Modal(document.getElementById('eventoModal'));
  const empleadoSelect = document.getElementById('eventoEmpleado');
  const clienteSelect = document.getElementById('eventoCliente');
  const btnEliminar = document.getElementById('btnEliminarEvento');
  const btnGuardar = document.getElementById('btnGuardarEvento');
  const filtroCalEmpleado = document.getElementById('filtroCalEmpleado');
  const filtroCalEstatus = document.getElementById('filtroCalEstatus');
  const preciosGroup = document.getElementById('eventoPreciosGroup');
  const estatusGroup = document.getElementById('eventoEstatusGroup');

  function setFormReadOnly(readonly) {
    document.querySelectorAll('#eventoForm input, #eventoForm select, #eventoForm textarea').forEach((el) => {
      el.disabled = readonly;
    });
  }

  async function loadSelects() {
    const empleadosPromise = api.listEmpleados(true);
    const clientesPromise = supervisor ? api.listClientes() : Promise.resolve([]);
    const [empleados, clientes] = await Promise.all([empleadosPromise, clientesPromise]);

    const empOptions = empleados
      .map((e) => `<option value="${e.codigo}">${e.nombre} (${e.telefono})</option>`)
      .join('');

    if (supervisor) {
      empleadoSelect.innerHTML = '<option value="">Seleccione empleado</option>' + empOptions;
      if (filtroCalEmpleado) {
        filtroCalEmpleado.innerHTML =
          '<option value="">Todos los empleados activos</option>' + empOptions;
      }
      clienteSelect.innerHTML =
        '<option value="">Seleccione cliente</option>' +
        clientes.map((c) => `<option value="${c.codigo}">${clienteLabel(c)}</option>`).join('');
      if (empleados.length === 0) toastWarning('Registre empleados activos en la sección Empleados.');
      if (clientes.length === 0) toastWarning('Registre clientes en la sección Clientes.');
    }
  }

  function openModal(evento = null, defaults = {}) {
    document.getElementById('eventoForm').reset();
    setFormReadOnly(!supervisor);
    preciosGroup.classList.toggle('d-none', !supervisor);
    estatusGroup.classList.toggle('d-none', !supervisor);
    btnGuardar.classList.toggle('d-none', !supervisor);
    btnEliminar.classList.toggle('d-none', !supervisor || !evento);

    if (evento) {
      document.getElementById('eventoModalLabel').textContent = supervisor ? 'Editar evento' : 'Detalle del evento';
      document.getElementById('eventoId').value = evento.id;
      document.getElementById('eventoTitulo').value = evento.titulo;
      document.getElementById('eventoObservaciones').value = evento.observaciones || '';
      document.getElementById('eventoInicio').value = toDatetimeLocal(evento.inicio);
      document.getElementById('eventoFin').value = toDatetimeLocal(evento.fin);
      if (supervisor) {
        empleadoSelect.value = String(evento.empleado_codigo);
        clienteSelect.value = evento.cliente_codigo ? String(evento.cliente_codigo) : '';
      } else {
        empleadoSelect.innerHTML = `<option value="${evento.empleado_codigo}">${evento.empleado_nombre}</option>`;
        clienteSelect.innerHTML = `<option value="${evento.cliente_codigo || ''}">${evento.cliente_empresa || 'Sin cliente'}</option>`;
      }
      document.getElementById('eventoEstatus').value = evento.estatus || 'pendiente';
      document.getElementById('eventoCotizado').value =
        evento.cotizado != null ? evento.cotizado : '';
      document.getElementById('eventoTotalPrecio').value =
        evento.totalprecio != null ? evento.totalprecio : '';
    } else {
      document.getElementById('eventoModalLabel').textContent = 'Nuevo evento';
      document.getElementById('eventoId').value = '';
      document.getElementById('eventoInicio').value = defaults.inicio || '';
      document.getElementById('eventoFin').value = defaults.fin || '';
      document.getElementById('eventoEstatus').value = 'pendiente';
    }
    eventoModal.show();
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
    selectable: supervisor,
    events: async (info, success, failure) => {
      try {
        const eventos = await api.listEventos(info.startStr, info.endStr);
        success(applyFilters(eventos).map(mapCalendarEvent));
      } catch (err) {
        failure(err);
        toastError(err.message);
      }
    },
    dateClick(info) {
      if (!supervisor) return;
      const end = new Date(info.date.getTime() + 3600000);
      openModal(null, {
        inicio: toDatetimeLocalFromDate(info.date),
        fin: toDatetimeLocalFromDate(end),
      });
    },
    select(info) {
      if (!supervisor) return;
      const end = info.end ? new Date(info.end.getTime() - 1) : info.start;
      openModal(null, {
        inicio: toDatetimeLocalFromDate(info.start),
        fin: toDatetimeLocalFromDate(end),
      });
    },
    eventClick(info) {
      openModal(info.event.extendedProps);
    },
  });
  calendar.render();

  document.getElementById('eventoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!supervisor) return;

    const id = document.getElementById('eventoId').value;
    const estatus = document.getElementById('eventoEstatus').value;
    let totalprecio =
      document.getElementById('eventoTotalPrecio').value !== ''
        ? Number(document.getElementById('eventoTotalPrecio').value)
        : null;
    const cotizado =
      document.getElementById('eventoCotizado').value !== ''
        ? Number(document.getElementById('eventoCotizado').value)
        : null;

    if (estatus === 'realizado' && (totalprecio === null || Number.isNaN(totalprecio))) {
      const prompted = await promptTotalPrecio();
      if (prompted === null) return;
      totalprecio = prompted;
      document.getElementById('eventoTotalPrecio').value = totalprecio;
    }

    const body = {
      titulo: document.getElementById('eventoTitulo').value.trim(),
      observaciones: document.getElementById('eventoObservaciones').value.trim() || null,
      descripcion: null,
      inicio: fromDatetimeLocal(document.getElementById('eventoInicio').value),
      fin: fromDatetimeLocal(document.getElementById('eventoFin').value),
      empleado_codigo: Number(empleadoSelect.value),
      cliente_codigo: Number(clienteSelect.value),
      estatus,
      totalprecio,
      cotizado,
    };

    if (!body.titulo || !body.empleado_codigo || !body.cliente_codigo) {
      toastError('Complete título, empleado y cliente.');
      return;
    }
    if (new Date(body.inicio) >= new Date(body.fin)) {
      toastError('La fecha de fin debe ser posterior a la de inicio.');
      return;
    }

    try {
      if (id) {
        await api.updateEvento({ id: Number(id), ...body });
        toastSuccess('Evento actualizado');
      } else {
        await api.createEvento(body);
        toastSuccess('Evento creado');
      }
      eventoModal.hide();
      refetchCalendar();
    } catch (err) {
      toastError(err.message);
    }
  });

  btnEliminar.addEventListener('click', async () => {
    const id = document.getElementById('eventoId').value;
    if (!id) return;
    const ok = await confirmAction('Eliminar evento', 'Esta acción no se puede deshacer.');
    if (!ok) return;
    try {
      await api.deleteEvento(Number(id));
      eventoModal.hide();
      toastSuccess('Evento eliminado');
      refetchCalendar();
    } catch (err) {
      toastError(err.message);
    }
  });

  await loadSelects();
}
