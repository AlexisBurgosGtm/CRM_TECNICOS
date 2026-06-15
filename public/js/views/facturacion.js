import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { toastError, toastSuccess, confirmMarcarPagadaFactura } from '../alerts.js';
import { formatDate, formatImporte } from '../format.js';
import { runButtonAction, runFormAction } from '../form-actions.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function isPagada(f) {
  return String(f.pagada || 'NO').toUpperCase() === 'SI';
}

function sumImporte(items) {
  return items.reduce((sum, item) => sum + (item.total != null ? Number(item.total) : 0), 0);
}

function pagadaBadge(pagada, idfac) {
  const value = String(pagada || 'NO').toUpperCase();
  if (value === 'SI') {
    return `<button type="button" class="btn btn-link p-0 border-0 badge-pagada-factura badge-pagada-si" data-idfac="${idfac}" title="Ver detalle">
      <span class="badge badge-estado-activo">SI</span>
    </button>`;
  }
  return `<button type="button" class="btn btn-link p-0 border-0 badge-pagada-factura badge-pagada-no" data-idfac="${idfac}" title="Registrar pago">
    <span class="badge badge-estado-inactivo">NO</span>
  </button>`;
}

function monthOptions(selected) {
  const labels = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return labels
    .map((label, i) => {
      const m = i + 1;
      return `<option value="${m}" ${m === selected ? 'selected' : ''}>${label}</option>`;
    })
    .join('');
}

function yearOptions(selected) {
  const current = new Date().getFullYear();
  const years = [];
  for (let y = current + 1; y >= current - 8; y -= 1) years.push(y);
  return years
    .map((y) => `<option value="${y}" ${y === selected ? 'selected' : ''}>${y}</option>`)
    .join('');
}

function facturaNumeroLabel(f) {
  if (f.serie && f.numero) return `${f.serie}-${f.numero}`;
  if (f.numero) return String(f.numero);
  return String(f.idfac ?? f.id ?? '—');
}

export async function renderFacturacion(root) {
  updateAppShell('facturacion', 'Facturacion');
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  root.innerHTML = `
    <main class="container-fluid py-2">
      <div class="row g-2 mb-3 facturacion-stats">
        <div class="col-6 col-xl-3">
          <div class="card facturacion-stat-card shadow-sm">
            <div class="card-body">
              <div class="facturacion-stat-label">Tickets por facturar</div>
              <div class="facturacion-stat-value" id="statPendientesCount">0</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-xl-3">
          <div class="card facturacion-stat-card shadow-sm">
            <div class="card-body">
              <div class="facturacion-stat-label">Facturas emitidas</div>
              <div class="facturacion-stat-value" id="statEmitidasCount">0</div>
              <div class="facturacion-stat-sub" id="statEmitidasImporte">Q 0.00</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-xl-3">
          <div class="card facturacion-stat-card shadow-sm">
            <div class="card-body">
              <div class="facturacion-stat-label">No pagadas</div>
              <div class="facturacion-stat-value text-danger" id="statNoPagadasCount">0</div>
              <div class="facturacion-stat-sub" id="statNoPagadasImporte">Q 0.00</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-xl-3">
          <div class="card facturacion-stat-card shadow-sm">
            <div class="card-body">
              <div class="facturacion-stat-label">Pagadas</div>
              <div class="facturacion-stat-value text-success" id="statPagadasCount">0</div>
              <div class="facturacion-stat-sub" id="statPagadasImporte">Q 0.00</div>
            </div>
          </div>
        </div>
      </div>

      <div class="row g-3 facturacion-split">
        <div class="col-lg-4">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header card-header-app py-2">
              <h2 class="h6 mb-0"><i class="fa-solid fa-file-circle-plus me-2"></i>Tickets pendientes de factura</h2>
            </div>
            <div class="card-body py-2 p-0">
              <div class="table-responsive facturacion-table-wrap facturacion-table-wrap-sm">
                <table class="table table-sm table-striped table-hover small mb-0">
                  <thead class="table-app">
                    <tr>
                      <th>Fecha</th>
                      <th>Cliente</th>
                      <th class="text-end">Importe</th>
                      <th class="text-end">Acción</th>
                    </tr>
                  </thead>
                  <tbody id="facturacionPendientesBody">
                    <tr><td colspan="4" class="text-center text-muted">Cargando...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-8">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header card-header-app py-2">
              <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                <h2 class="h6 mb-0"><i class="fa-solid fa-file-invoice-dollar me-2"></i>Facturas emitidas</h2>
                <div class="d-flex flex-wrap align-items-center gap-2">
                  <select class="form-select form-select-sm" id="facturacionEstado" style="width:auto;min-width:10rem" title="Filtro de tabla">
                    <option value="todas" selected>Todas</option>
                    <option value="no">Pendientes de pago</option>
                    <option value="si">Pagadas</option>
                  </select>
                  <select class="form-select form-select-sm" id="facturacionMes" style="width:auto;min-width:7rem">
                    ${monthOptions(currentMonth)}
                  </select>
                  <select class="form-select form-select-sm" id="facturacionAnio" style="width:auto;min-width:5rem">
                    ${yearOptions(currentYear)}
                  </select>
                </div>
              </div>
            </div>
            <div class="card-body py-2 p-0">
              <div class="table-responsive facturacion-table-wrap">
                <table class="table table-sm table-striped table-hover small mb-0">
                  <thead class="table-app">
                    <tr>
                      <th>No.</th>
                      <th>Fecha</th>
                      <th>Cliente</th>
                      <th class="text-end">Importe</th>
                      <th class="text-center">Pagada</th>
                    </tr>
                  </thead>
                  <tbody id="facturacionEmitidasBody">
                    <tr><td colspan="5" class="text-center text-muted">Cargando...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <div class="modal fade" id="facturaModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="facturaModalLabel">Factura</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="facturaForm" class="modal-body py-2">
            <input type="hidden" id="facturaIdfac">
            <div class="row g-2 mb-2">
              <div class="col-6">
                <label class="form-label text-muted small mb-0">Fecha</label>
                <div id="facturaFechaDisplay" class="fw-semibold">—</div>
              </div>
              <div class="col-6">
                <label class="form-label" for="facturaImporte">Importe</label>
                <div class="input-group input-group-sm">
                  <span class="input-group-text">Q</span>
                  <input type="number" class="form-control form-control-sm" id="facturaImporte" min="0" step="0.01">
                </div>
              </div>
            </div>
            <div class="mb-2">
              <label class="form-label text-muted small mb-0">Cliente</label>
              <div id="facturaClienteDisplay">—</div>
            </div>
            <div id="facturaFacDatosGroup" class="mb-2" style="display:none">
              <label class="form-label text-muted small mb-0">Datos de facturación</label>
              <div id="facturaFacDatosDisplay" class="small text-muted">—</div>
            </div>
            <div id="facturaTicketGroup" class="mb-2" style="display:none">
              <label class="form-label text-muted small mb-0">Ticket</label>
              <div id="facturaTicketDisplay">—</div>
            </div>
            <div class="row g-2 mb-2">
              <div class="col-sm-6">
                <label class="form-label" for="facturaSerie">Serie</label>
                <input type="text" class="form-control form-control-sm" id="facturaSerie" maxlength="255">
              </div>
              <div class="col-sm-6">
                <label class="form-label" for="facturaNumero">Número</label>
                <input type="text" class="form-control form-control-sm" id="facturaNumero" maxlength="255">
              </div>
            </div>
            <div id="facturaPagadaGroup" class="mb-0" style="display:none">
              <label class="form-label text-muted small mb-0">Fecha de pago</label>
              <div id="facturaFechaPagadaDisplay" class="fw-semibold text-success">—</div>
            </div>
          </form>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
            <button type="submit" form="facturaForm" class="btn btn-primary btn-sm" id="facturaGuardarBtn">
              <i class="fa-solid fa-floppy-disk me-1"></i>Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  await bindLogout();

  const pendientesBody = document.getElementById('facturacionPendientesBody');
  const emitidasBody = document.getElementById('facturacionEmitidasBody');
  const facturaModal = new bootstrap.Modal(document.getElementById('facturaModal'));
  const facturaForm = document.getElementById('facturaForm');
  const facturaGuardarBtn = document.getElementById('facturaGuardarBtn');
  let facturaModalReadonly = false;
  let facturasPeriodo = [];

  function updatePendientesCard(count) {
    document.getElementById('statPendientesCount').textContent = String(count);
  }

  function updateFacturaCards(facturas) {
    const noPagadas = facturas.filter((f) => !isPagada(f));
    const pagadas = facturas.filter(isPagada);

    document.getElementById('statEmitidasCount').textContent = String(facturas.length);
    document.getElementById('statEmitidasImporte').textContent = formatImporte(sumImporte(facturas));

    document.getElementById('statNoPagadasCount').textContent = String(noPagadas.length);
    document.getElementById('statNoPagadasImporte').textContent = formatImporte(sumImporte(noPagadas));

    document.getElementById('statPagadasCount').textContent = String(pagadas.length);
    document.getElementById('statPagadasImporte').textContent = formatImporte(sumImporte(pagadas));
  }

  function getFacturasForTable() {
    const estado = document.getElementById('facturacionEstado').value;
    if (estado === 'si') return facturasPeriodo.filter(isPagada);
    if (estado === 'no') return facturasPeriodo.filter((f) => !isPagada(f));
    return facturasPeriodo;
  }

  function setFacturaFormReadonly(readonly) {
    facturaModalReadonly = readonly;
    document.getElementById('facturaSerie').readOnly = readonly;
    document.getElementById('facturaNumero').readOnly = readonly;
    document.getElementById('facturaImporte').readOnly = readonly;
    facturaGuardarBtn.style.display = readonly ? 'none' : '';
    document.getElementById('facturaModalLabel').textContent = readonly
      ? 'Detalle de factura'
      : 'Editar factura';
  }

  function fillFacturaModal(f) {
    document.getElementById('facturaIdfac').value = f.idfac;
    document.getElementById('facturaFechaDisplay').textContent = formatDate(f.fecha);
    document.getElementById('facturaImporte').value =
      f.total != null && f.total !== '' ? Number(f.total) : '';
    document.getElementById('facturaClienteDisplay').textContent = f.cliente || '—';
    document.getElementById('facturaSerie').value = f.serie || '';
    document.getElementById('facturaNumero').value = f.numero || '';

    const facParts = [f.fac_nit, f.fac_nombre, f.fac_direccion].filter((v) => v && String(v).trim());
    const facGroup = document.getElementById('facturaFacDatosGroup');
    if (facParts.length) {
      facGroup.style.display = '';
      document.getElementById('facturaFacDatosDisplay').innerHTML = facParts
        .map((p) => escapeHtml(p))
        .join('<br>');
    } else {
      facGroup.style.display = 'none';
    }

    const ticketGroup = document.getElementById('facturaTicketGroup');
    if (f.ticket_id) {
      ticketGroup.style.display = '';
      document.getElementById('facturaTicketDisplay').textContent = `#${f.ticket_id}`;
    } else {
      ticketGroup.style.display = 'none';
    }

    const pagadaGroup = document.getElementById('facturaPagadaGroup');
    const pagada = String(f.pagada || 'NO').toUpperCase();
    if (pagada === 'SI') {
      pagadaGroup.style.display = '';
      document.getElementById('facturaFechaPagadaDisplay').textContent = f.fecha_pagada
        ? formatDate(f.fecha_pagada)
        : '—';
      setFacturaFormReadonly(true);
    } else {
      pagadaGroup.style.display = 'none';
      setFacturaFormReadonly(false);
    }
  }

  async function openFacturaModal(idfac, { readonly = false } = {}) {
    try {
      const factura = await api.getFactura(idfac);
      const isPaid = isPagada(factura);
      fillFacturaModal(factura);
      if (readonly || isPaid) {
        setFacturaFormReadonly(true);
      }
      facturaModal.show();
    } catch (err) {
      toastError(err.message);
    }
  }

  async function marcarPagada(idfac) {
    const fechaPagada = await confirmMarcarPagadaFactura();
    if (!fechaPagada) return;
    try {
      await api.marcarFacturaPagada(idfac, fechaPagada);
      toastSuccess('Factura marcada como pagada');
      await loadFacturas();
    } catch (err) {
      toastError(err.message);
    }
  }

  function bindFacturaRowEvents() {
    emitidasBody.querySelectorAll('.factura-row').forEach((row) => {
      row.addEventListener('click', () => {
        const idfac = Number(row.dataset.idfac);
        const pagada = String(row.dataset.pagada || 'NO').toUpperCase();
        openFacturaModal(idfac, { readonly: pagada === 'SI' });
      });
    });

    emitidasBody.querySelectorAll('.badge-pagada-no').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        marcarPagada(Number(btn.dataset.idfac));
      });
    });

    emitidasBody.querySelectorAll('.badge-pagada-si').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openFacturaModal(Number(btn.dataset.idfac), { readonly: true });
      });
    });
  }

  function renderFacturasTable() {
    const facturas = getFacturasForTable();
    const estado = document.getElementById('facturacionEstado').value;
    const emptyPeriodo = !facturasPeriodo.length;
    const emptyFiltered = !facturas.length;

    if (emptyPeriodo) {
      emitidasBody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted">Sin facturas en el periodo</td></tr>';
      return;
    }

    if (emptyFiltered) {
      const msg =
        estado === 'si'
          ? 'Sin facturas pagadas en el periodo'
          : estado === 'no'
            ? 'Sin facturas pendientes de pago en el periodo'
            : 'Sin facturas en el periodo';
      emitidasBody.innerHTML =
        `<tr><td colspan="5" class="text-center text-muted">${msg}</td></tr>`;
      return;
    }

    emitidasBody.innerHTML = facturas
      .map(
        (f) => `
        <tr class="factura-row" data-idfac="${f.idfac}" data-pagada="${escapeHtml(f.pagada)}" style="cursor:pointer" title="Ver o editar factura">
          <td>${escapeHtml(facturaNumeroLabel(f))}</td>
          <td class="text-nowrap">${escapeHtml(formatDate(f.fecha))}</td>
          <td>${escapeHtml(f.cliente)}</td>
          <td class="text-end text-nowrap">${escapeHtml(formatImporte(f.total))}</td>
          <td class="text-center">${pagadaBadge(f.pagada, f.idfac)}</td>
        </tr>`
      )
      .join('');
    bindFacturaRowEvents();
  }

  facturaForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (facturaModalReadonly) return;
    await runFormAction('facturaForm', 'Guardando…', async () => {
      const idfac = Number(document.getElementById('facturaIdfac').value);
      const serie = document.getElementById('facturaSerie').value.trim();
      const numero = document.getElementById('facturaNumero').value.trim();
      const importeVal = document.getElementById('facturaImporte').value.trim();
      try {
        await api.updateFactura(idfac, serie, numero, importeVal !== '' ? Number(importeVal) : null);
        toastSuccess('Factura actualizada');
        facturaModal.hide();
        await loadFacturas();
      } catch (err) {
        toastError(err.message);
      }
    });
  });

  async function loadPendientes() {
    try {
      const tickets = await api.listFacturacionPendientes();
      updatePendientesCard(tickets.length);

      if (!tickets.length) {
        pendientesBody.innerHTML =
          '<tr><td colspan="4" class="text-center text-muted">Sin tickets pendientes de factura</td></tr>';
        return;
      }
      pendientesBody.innerHTML = tickets
        .map(
          (t) => `
        <tr>
          <td class="text-nowrap">${escapeHtml(formatDate(t.fecha))}</td>
          <td>${escapeHtml(t.cliente)}</td>
          <td class="text-end text-nowrap">${t.totalprecio != null ? escapeHtml(formatImporte(t.totalprecio)) : '—'}</td>
          <td class="text-end">
            <button type="button" class="btn btn-outline-primary btn-sm btn-facturar-ticket" data-id="${t.id}">
              <i class="fa-solid fa-file-invoice me-1"></i>Facturar
            </button>
          </td>
        </tr>`
        )
        .join('');

      document.querySelectorAll('.btn-facturar-ticket').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const ticketId = Number(btn.dataset.id);
          await runButtonAction(
            btn,
            async () => {
              try {
                await api.emitirFactura(ticketId);
                toastSuccess('Factura emitida');
                await loadPendientes();
                await loadFacturas();
              } catch (err) {
                toastError(err.message);
              }
            },
            { loadingText: 'Facturando…' }
          );
        });
      });
    } catch (err) {
      updatePendientesCard(0);
      pendientesBody.innerHTML =
        '<tr><td colspan="4" class="text-danger text-center">Error al cargar</td></tr>';
      toastError(err.message);
    }
  }

  async function loadFacturas() {
    const month = Number(document.getElementById('facturacionMes').value);
    const year = Number(document.getElementById('facturacionAnio').value);
    try {
      facturasPeriodo = await api.listFacturas(year, month);
      updateFacturaCards(facturasPeriodo);
      renderFacturasTable();
    } catch (err) {
      facturasPeriodo = [];
      updateFacturaCards([]);
      emitidasBody.innerHTML =
        '<tr><td colspan="5" class="text-danger text-center">Error al cargar</td></tr>';
      toastError(err.message);
    }
  }

  document.getElementById('facturacionMes').addEventListener('change', loadFacturas);
  document.getElementById('facturacionAnio').addEventListener('change', loadFacturas);
  document.getElementById('facturacionEstado').addEventListener('change', renderFacturasTable);

  await Promise.all([loadPendientes(), loadFacturas()]);
}
