import * as api from '../api.js';
import { renderAppShell, bindLogout } from '../components/layout.js';
import { toastSuccess, toastError, confirmAction } from '../alerts.js';

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

function formatImporte(value) {
  const n = value == null || Number.isNaN(Number(value)) ? 0 : Number(value);
  return `Q ${n.toFixed(2)}`;
}

function statusBadge(status) {
  if (status === 'TERMINADA') {
    return '<span class="badge badge-estatus-realizado">Terminada</span>';
  }
  return '<span class="badge badge-estatus-pendiente">Pendiente</span>';
}

export async function renderCotizaciones(root) {
  const { start, end } = monthRange();
  let cotizaciones = [];
  let selectedId = null;

  root.innerHTML = `
    ${renderAppShell('cotizaciones', 'Cotizaciones')}
    <main class="container-fluid py-2">
      <div class="row g-3 cotizaciones-split">
        <div class="col-lg-7">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header card-header-app py-2 d-flex justify-content-between align-items-center">
              <h2 class="h6 mb-0"><i class="fa-solid fa-file-invoice-dollar me-2"></i>Lista de cotizaciones</h2>
              <button type="button" class="btn btn-light btn-sm" id="btnNuevaCotizacion">
                <i class="fa-solid fa-plus me-1"></i>Nueva
              </button>
            </div>
            <div class="card-body py-2">
              <form id="filtroCotizacionesForm" class="row g-2 align-items-end mb-2">
                <div class="col-5">
                  <label class="form-label" for="filtroCotDesde">Desde</label>
                  <input type="date" class="form-control form-control-sm" id="filtroCotDesde" value="${start}" required>
                </div>
                <div class="col-5">
                  <label class="form-label" for="filtroCotHasta">Hasta</label>
                  <input type="date" class="form-control form-control-sm" id="filtroCotHasta" value="${end}" required>
                </div>
                <div class="col-2">
                  <button type="submit" class="btn btn-primary btn-sm w-100">
                    <i class="fa-solid fa-magnifying-glass"></i>
                  </button>
                </div>
              </form>
              <div class="table-responsive cotizaciones-list-wrap">
                <table class="table table-sm table-hover small mb-0">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Fecha</th>
                      <th>Cliente</th>
                      <th>Teléfono</th>
                      <th>Vence</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="cotizacionesTableBody">
                    <tr><td colspan="7" class="text-center text-muted">Cargando...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header card-header-app py-2">
              <h2 class="h6 mb-0"><i class="fa-solid fa-pen-to-square me-2"></i>Detalle de cotización</h2>
            </div>
            <div class="card-body py-2">
              <form id="cotizacionForm">
                <input type="hidden" id="cotizacionId">
                <div class="mb-2">
                  <label class="form-label" for="cotizacionFecha">Fecha</label>
                  <input type="date" class="form-control form-control-sm" id="cotizacionFecha" required>
                </div>
                <div class="mb-2">
                  <label class="form-label" for="cotizacionCliente">Cliente</label>
                  <input type="text" class="form-control form-control-sm" id="cotizacionCliente" required>
                </div>
                <div class="mb-2">
                  <label class="form-label" for="cotizacionTelefono">Teléfono</label>
                  <input type="text" class="form-control form-control-sm" id="cotizacionTelefono" required>
                </div>
                <div class="mb-2">
                  <label class="form-label" for="cotizacionVence">Vence</label>
                  <input type="date" class="form-control form-control-sm" id="cotizacionVence" required>
                </div>
                <div class="mb-2">
                  <label class="form-label" for="cotizacionTotalPrecio">Total precio</label>
                  <input type="number" class="form-control form-control-sm" id="cotizacionTotalPrecio" min="0" step="0.01">
                </div>
                <div class="mb-2">
                  <label class="form-label" for="cotizacionStatus">Status</label>
                  <select class="form-select form-select-sm" id="cotizacionStatus" required>
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="TERMINADA">Terminada</option>
                  </select>
                </div>
                <div class="mb-2">
                  <label class="form-label" for="cotizacionDetalles">Detalles</label>
                  <textarea class="form-control form-control-sm" id="cotizacionDetalles" rows="6"></textarea>
                </div>
                <div class="d-flex flex-wrap gap-2">
                  <button type="submit" class="btn btn-primary btn-sm">Guardar</button>
                  <button type="button" class="btn btn-secondary btn-sm" id="btnLimpiarCotizacion">Nueva</button>
                  <button type="button" class="btn btn-danger btn-sm d-none" id="btnEliminarCotizacion">Eliminar</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
  `;

  await bindLogout();

  const tableBody = document.getElementById('cotizacionesTableBody');
  const btnEliminar = document.getElementById('btnEliminarCotizacion');

  function clearForm() {
    selectedId = null;
    document.getElementById('cotizacionForm').reset();
    document.getElementById('cotizacionId').value = '';
    document.getElementById('cotizacionFecha').value = toDateInput(new Date());
    document.getElementById('cotizacionStatus').value = 'PENDIENTE';
    btnEliminar.classList.add('d-none');
    document.querySelectorAll('#cotizacionesTableBody tr').forEach((row) => {
      row.classList.remove('table-active');
    });
  }

  function fillForm(cot) {
    selectedId = cot.id;
    document.getElementById('cotizacionId').value = cot.id;
    document.getElementById('cotizacionFecha').value = cot.fecha;
    document.getElementById('cotizacionCliente').value = cot.cliente;
    document.getElementById('cotizacionTelefono').value = cot.telefono;
    document.getElementById('cotizacionVence').value = cot.vence;
    document.getElementById('cotizacionTotalPrecio').value =
      cot.totalprecio != null ? cot.totalprecio : '';
    document.getElementById('cotizacionStatus').value = cot.status || 'PENDIENTE';
    document.getElementById('cotizacionDetalles').value = cot.detalles || '';
    btnEliminar.classList.remove('d-none');
  }

  function renderTable() {
    if (!cotizaciones.length) {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="text-center text-muted">No hay cotizaciones en el rango.</td></tr>';
      return;
    }

    tableBody.innerHTML = cotizaciones
      .map(
        (c) => `
        <tr class="cotizacion-row ${selectedId === c.id ? 'table-active' : ''}" data-id="${c.id}" role="button">
          <td>${c.id}</td>
          <td class="text-nowrap">${escapeHtml(c.fecha)}</td>
          <td>${escapeHtml(c.cliente)}</td>
          <td>${escapeHtml(c.telefono)}</td>
          <td class="text-nowrap">${escapeHtml(c.vence)}</td>
          <td class="text-nowrap">${formatImporte(c.totalprecio)}</td>
          <td>${statusBadge(c.status)}</td>
        </tr>`
      )
      .join('');

    document.querySelectorAll('.cotizacion-row').forEach((row) => {
      row.addEventListener('click', async () => {
        const id = Number(row.dataset.id);
        try {
          const cot = await api.getCotizacion(id);
          fillForm(cot);
          renderTable();
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  async function loadList() {
    const desde = document.getElementById('filtroCotDesde').value;
    const hasta = document.getElementById('filtroCotHasta').value;
    if (!desde || !hasta) {
      toastError('Seleccione el rango de fechas.');
      return;
    }
    if (desde > hasta) {
      toastError('La fecha inicial no puede ser mayor que la final.');
      return;
    }

    try {
      cotizaciones = await api.listCotizaciones(desde, hasta);
      renderTable();
    } catch (err) {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="text-center text-danger">Error al cargar</td></tr>';
      toastError(err.message);
    }
  }

  document.getElementById('filtroCotizacionesForm').addEventListener('submit', (e) => {
    e.preventDefault();
    loadList();
  });

  document.getElementById('btnNuevaCotizacion').addEventListener('click', clearForm);
  document.getElementById('btnLimpiarCotizacion').addEventListener('click', clearForm);

  document.getElementById('cotizacionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cotizacionId').value;
    const totalRaw = document.getElementById('cotizacionTotalPrecio').value;
    const body = {
      fecha: document.getElementById('cotizacionFecha').value,
      cliente: document.getElementById('cotizacionCliente').value.trim(),
      telefono: document.getElementById('cotizacionTelefono').value.trim(),
      vence: document.getElementById('cotizacionVence').value,
      totalprecio: totalRaw !== '' ? Number(totalRaw) : null,
      detalles: document.getElementById('cotizacionDetalles').value.trim() || null,
      status: document.getElementById('cotizacionStatus').value,
    };

    try {
      if (id) {
        await api.updateCotizacion({ id: Number(id), ...body });
        toastSuccess('Cotización actualizada');
      } else {
        const created = await api.createCotizacion(body);
        fillForm(created);
        toastSuccess('Cotización creada');
      }
      await loadList();
    } catch (err) {
      toastError(err.message);
    }
  });

  btnEliminar.addEventListener('click', async () => {
    const id = document.getElementById('cotizacionId').value;
    if (!id) return;
    const ok = await confirmAction('Eliminar cotización', '¿Confirma la eliminación?');
    if (!ok) return;
    try {
      await api.deleteCotizacion(Number(id));
      clearForm();
      toastSuccess('Cotización eliminada');
      await loadList();
    } catch (err) {
      toastError(err.message);
    }
  });

  clearForm();
  await loadList();
}
