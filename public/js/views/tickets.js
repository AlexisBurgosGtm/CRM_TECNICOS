import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { isSupervisor } from '../auth.js';
import { toastSuccess, toastError, confirmAction } from '../alerts.js';
import { formatDate } from '../format.js';
import { renderTicketDetailHtml, bindPhotoZoom } from '../components/ticket-detail.js';

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

async function readOptionalPhoto(inputId) {
  const input = document.getElementById(inputId);
  if (!input?.files?.[0]) return null;
  const file = input.files[0];
  const data = await readFileAsDataUrl(file);
  return { name: file.name, data };
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
  document.getElementById('btnFabNuevoTicket')?.remove();
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.id = 'btnFabNuevoTicket';
  fab.className = 'btn btn-primary fab-add-floating';
  fab.setAttribute('aria-label', 'Nuevo ticket');
  fab.innerHTML = '<i class="fa-solid fa-plus"></i>';
  document.body.appendChild(fab);
  return fab;
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
              <label class="form-label" for="finalizarFoto1">Foto 1</label>
              <input type="file" class="form-control form-control-sm" id="finalizarFoto1" accept="image/*">
            </div>
            <div class="mb-2">
              <label class="form-label" for="finalizarFoto2">Foto 2</label>
              <input type="file" class="form-control form-control-sm" id="finalizarFoto2" accept="image/*">
            </div>
            <div class="mb-2">
              <label class="form-label" for="finalizarFoto3">Foto 3</label>
              <input type="file" class="form-control form-control-sm" id="finalizarFoto3" accept="image/*">
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

  function detailButtonHtml(id) {
    return `<button type="button" class="btn btn-outline-info btn-sm btn-ticket-detalle" data-id="${id}" title="Ver detalle">
              <i class="fa-solid fa-eye"></i>
            </button>`;
  }

  function openDetailModal(ticket) {
    document.getElementById('ticketsDetailModalLabel').textContent = `Ticket #${ticket.id}`;
    const body = document.getElementById('ticketsDetailModalBody');
    body.innerHTML = renderTicketDetailHtml(ticket);
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
            ${detailButtonHtml(t.id)}
            <button type="button" class="btn btn-outline-success btn-sm btn-ticket-finalizar" data-id="${t.id}" title="Finalizar">
              <i class="fa-solid fa-check me-1"></i>Finalizar
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-ticket-delete" data-id="${t.id}" title="Eliminar">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>`
          : `<td class="text-end text-nowrap ticket-row-actions" data-label="Acciones">
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
    bindFinalizarActions();
    if (supervisor) bindSupervisorRowActions();
  }

  finalizarModal = new bootstrap.Modal(document.getElementById('finalizarTicketModal'));

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
    const id = Number(document.getElementById('finalizarTicketId').value);

    try {
      const totalVal = document.getElementById('finalizarTotalPrecio').value.trim();
      const body = {
        fecha_fin: document.getElementById('finalizarFechaFin').value,
        totalprecio: totalVal !== '' ? Number(totalVal) : null,
        reporte_tecnico: document.getElementById('finalizarReporteTecnico').value.trim() || null,
        accesos: document.getElementById('finalizarAccesos').value.trim() || null,
        notas: document.getElementById('finalizarNotas').value.trim() || null,
        insumos: document.getElementById('finalizarInsumos').value.trim() || null,
      };
      const f1 = await readOptionalPhoto('finalizarFoto1');
      const f2 = await readOptionalPhoto('finalizarFoto2');
      const f3 = await readOptionalPhoto('finalizarFoto3');
      if (f1) body.foto1 = f1;
      if (f2) body.foto2 = f2;
      if (f3) body.foto3 = f3;

      await api.finalizarTicket(id, body);
      finalizarModal.hide();
      toastSuccess('Ticket finalizado');
      await loadList();
    } catch (err) {
      toastError(err.message);
    }
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
          const ok = await confirmAction('Eliminar ticket', '¿Confirma la eliminación?');
          if (!ok) return;
          try {
            await api.deleteTicket(id);
            toastSuccess('Ticket eliminado');
            await loadList();
          } catch (err) {
            toastError(err.message);
          }
        });
      });
    };

    const fabBtn = mountTicketsFab();
    fabBtn.addEventListener('click', openCreateModal);

    document.getElementById('ticketForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('ticketId').value;
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

    document.getElementById('asignarTicketForm').addEventListener('submit', async (e) => {
      e.preventDefault();
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
