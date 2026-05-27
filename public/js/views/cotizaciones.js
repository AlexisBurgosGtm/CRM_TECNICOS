import * as api from '../api.js';
import { renderAppShell, bindLogout } from '../components/layout.js';
import { toastSuccess, toastError, confirmAction } from '../alerts.js';
import { formatDate, formatImporte } from '../format.js';

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
  if (status === 'TERMINADA') {
    return '<span class="badge badge-estatus-realizado">Terminada</span>';
  }
  return '<span class="badge badge-estatus-pendiente">Pendiente</span>';
}

function printCotizacion(cot) {
  const logoUrl = `${window.location.origin}/favicon.png`;
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cotización #${cot.id}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      color: #000;
      margin: 0 auto;
      padding: 8px 6px 12px;
      width: 72mm;
      font-size: 11px;
      line-height: 1.35;
    }
    .logo {
      display: block;
      width: 56px;
      height: 56px;
      object-fit: contain;
      margin: 0 auto 8px;
    }
    h1 {
      font-size: 16px;
      text-align: center;
      margin: 0 0 4px;
      letter-spacing: 0.5px;
    }
    .subtitle {
      text-align: center;
      font-size: 11px;
      margin: 0 0 12px;
    }
    .field { margin-bottom: 8px; }
    .label { font-weight: bold; display: block; }
    .value { display: block; margin-top: 2px; }
    .detalles-label { font-weight: bold; margin: 10px 0 4px; }
    .detalles {
      white-space: pre-wrap;
      border-top: 1px dashed #999;
      border-bottom: 1px dashed #999;
      padding: 8px 0;
      min-height: 40px;
    }
    .cliente, .telefono { margin-bottom: 6px; }
    .total {
      font-size: 14px;
      font-weight: bold;
      text-align: center;
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #000;
    }
    @media print {
      body { width: 72mm; }
    }
  </style>
</head>
<body>
  <img class="logo" src="${logoUrl}" alt="TECNOSYSTEM">
  <h1>TECNOSYSTEM</h1>
  <p class="subtitle">Cotización de servicio o productos</p>
  <div class="field">
    <span class="label">Fecha</span>
    <span class="value">${escapeHtml(formatDate(cot.fecha))}</span>
  </div>
  <div class="field">
    <span class="label">Valida hasta el ${escapeHtml(formatDate(cot.vence))}</span>
  </div>
  <div class="cliente"><strong>Cliente:</strong> ${escapeHtml(cot.cliente)}</div>
  <div class="telefono"><strong>Teléfono:</strong> ${escapeHtml(cot.telefono)}</div>
  <div class="detalles-label">Se cotizo lo siguiente:</div>
  <div class="detalles">${escapeHtml(cot.detalles || '—')}</div>
  <p class="total">Total: ${formatImporte(cot.totalprecio)}</p>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=360,height=720');
  if (!win) {
    toastError('Permita ventanas emergentes para imprimir.');
    return;
  }
  win.document.write(html);
  win.document.close();
}

export async function renderCotizaciones(root) {
  const { start, end } = monthRange();
  let cotizaciones = [];
  let cotizacionModal = null;

  root.innerHTML = `
    ${renderAppShell('cotizaciones', 'Cotizaciones')}
    <main class="container-fluid py-2 cotizaciones-page">
      <div class="card border-0 shadow-sm">
        <div class="card-header card-header-app py-2">
          <h2 class="h6 mb-0"><i class="fa-solid fa-file-invoice-dollar me-2"></i>Lista de cotizaciones</h2>
        </div>
        <div class="card-body py-2">
          <form id="filtroCotizacionesForm" class="row g-2 align-items-end mb-2">
            <div class="col-md-5">
              <label class="form-label" for="filtroCotDesde">Desde</label>
              <input type="date" class="form-control form-control-sm" id="filtroCotDesde" value="${start}" required>
            </div>
            <div class="col-md-5">
              <label class="form-label" for="filtroCotHasta">Hasta</label>
              <input type="date" class="form-control form-control-sm" id="filtroCotHasta" value="${end}" required>
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
                  <th>ID</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th>Vence</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th class="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody id="cotizacionesTableBody">
                <tr><td colspan="8" class="text-center text-muted">Cargando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
    <button type="button" class="btn btn-primary fab-add-cotizacion" id="btnFabNuevaCotizacion" aria-label="Nueva cotización">
      <i class="fa-solid fa-plus"></i>
    </button>
    <div class="modal fade" id="cotizacionModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="cotizacionModalLabel">Nueva cotización</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="cotizacionForm" class="modal-body py-2">
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
          </form>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" form="cotizacionForm" class="btn btn-primary btn-sm">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await bindLogout();

  cotizacionModal = new bootstrap.Modal(document.getElementById('cotizacionModal'));
  const tableBody = document.getElementById('cotizacionesTableBody');

  function openCreateModal() {
    const today = toDateInput(new Date());
    document.getElementById('cotizacionForm').reset();
    document.getElementById('cotizacionId').value = '';
    document.getElementById('cotizacionModalLabel').textContent = 'Nueva cotización';
    document.getElementById('cotizacionFecha').value = today;
    document.getElementById('cotizacionVence').value = today;
    document.getElementById('cotizacionStatus').value = 'PENDIENTE';
    cotizacionModal.show();
  }

  function openEditModal(cot) {
    document.getElementById('cotizacionModalLabel').textContent = `Editar cotización #${cot.id}`;
    document.getElementById('cotizacionId').value = cot.id;
    document.getElementById('cotizacionFecha').value = cot.fecha;
    document.getElementById('cotizacionCliente').value = cot.cliente;
    document.getElementById('cotizacionTelefono').value = cot.telefono;
    document.getElementById('cotizacionVence').value = cot.vence;
    document.getElementById('cotizacionTotalPrecio').value =
      cot.totalprecio != null ? cot.totalprecio : '';
    document.getElementById('cotizacionStatus').value = cot.status || 'PENDIENTE';
    document.getElementById('cotizacionDetalles').value = cot.detalles || '';
    cotizacionModal.show();
  }

  function bindRowActions() {
    document.querySelectorAll('.btn-cot-print').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        try {
          const cot = await api.getCotizacion(id);
          printCotizacion(cot);
        } catch (err) {
          toastError(err.message);
        }
      });
    });

    document.querySelectorAll('.btn-cot-edit').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        try {
          const cot = await api.getCotizacion(id);
          openEditModal(cot);
        } catch (err) {
          toastError(err.message);
        }
      });
    });

    document.querySelectorAll('.btn-cot-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const ok = await confirmAction('Eliminar cotización', '¿Confirma la eliminación?');
        if (!ok) return;
        try {
          await api.deleteCotizacion(id);
          toastSuccess('Cotización eliminada');
          await loadList();
        } catch (err) {
          toastError(err.message);
        }
      });
    });
  }

  function renderTable() {
    if (!cotizaciones.length) {
      tableBody.innerHTML =
        '<tr><td colspan="8" class="text-center text-muted">No hay cotizaciones en el rango.</td></tr>';
      return;
    }

    tableBody.innerHTML = cotizaciones
      .map(
        (c) => `
        <tr>
          <td>${c.id}</td>
          <td class="text-nowrap">${escapeHtml(formatDate(c.fecha))}</td>
          <td>${escapeHtml(c.cliente)}</td>
          <td>${escapeHtml(c.telefono)}</td>
          <td class="text-nowrap">${escapeHtml(formatDate(c.vence))}</td>
          <td class="text-nowrap">${formatImporte(c.totalprecio)}</td>
          <td>${statusBadge(c.status)}</td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-outline-secondary btn-sm btn-cot-print" data-id="${c.id}" title="Imprimir">
              <i class="fa-solid fa-print"></i>
            </button>
            <button type="button" class="btn btn-outline-primary btn-sm btn-cot-edit" data-id="${c.id}" title="Editar">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button type="button" class="btn btn-outline-danger btn-sm btn-cot-delete" data-id="${c.id}" title="Eliminar">
              <i class="fa-solid fa-trash"></i>
            </button>
          </td>
        </tr>`
      )
      .join('');

    bindRowActions();
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
        '<tr><td colspan="8" class="text-center text-danger">Error al cargar</td></tr>';
      toastError(err.message);
    }
  }

  document.getElementById('filtroCotizacionesForm').addEventListener('submit', (e) => {
    e.preventDefault();
    loadList();
  });

  document.getElementById('btnFabNuevaCotizacion').addEventListener('click', openCreateModal);

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
        await api.createCotizacion(body);
        toastSuccess('Cotización creada');
      }
      cotizacionModal.hide();
      await loadList();
    } catch (err) {
      toastError(err.message);
    }
  });

  await loadList();
}
