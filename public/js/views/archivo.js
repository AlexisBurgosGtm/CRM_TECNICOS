import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { toastError, toastSuccess } from '../alerts.js';
import { formatDate, formatImporte } from '../format.js';
import {
  statusBadge,
  renderTicketDetailHtml,
  bindPhotoZoom,
  bindTicketDetailImageDownload,
} from '../components/ticket-detail.js';
import { renderFacturaDetailHtml } from '../components/factura-detail.js';
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

function facturaNumeroLabel(f) {
  if (f.serie && f.numero) return `${f.serie}-${f.numero}`;
  if (f.numero) return String(f.numero);
  return String(f.idfac ?? f.id ?? '—');
}

function pagadaLabel(pagada) {
  return String(pagada || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO';
}

function matchesTicketSearch(ticket, query) {
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

function matchesFacturaSearch(factura, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const haystack = [
    factura.idfac,
    factura.serie,
    factura.numero,
    factura.fecha,
    factura.fecha_pagada,
    factura.cliente,
    factura.fac_nit,
    factura.fac_nombre,
    factura.pagada,
    factura.total,
    factura.ticket_id,
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  return haystack.includes(q);
}

const TICKET_COL_SPAN = 8;
const FACTURA_COL_SPAN = 10;

export async function renderArchivo(root) {
  updateAppShell('archivo', 'Archivo');
  const { start, end } = monthRange();
  let archiveMode = 'tickets';
  let tickets = [];
  let facturas = [];
  let searchQuery = '';
  let detailModal = null;
  let facturaDetailModal = null;

  root.innerHTML = `
    <main class="container-fluid py-2 cotizaciones-page">
      <div class="card border-0 shadow-sm">
        <div class="card-header card-header-app py-2">
          <h2 class="h6 mb-0" id="archivoCardTitle"><i class="fa-solid fa-box-archive me-2"></i>Archivo de tickets</h2>
        </div>
        <div class="card-body py-2">
          <div id="filtroArchivo" class="mb-2">
            <div class="row g-2 align-items-end">
              <div class="col-md-3">
                <label class="form-label" for="archivoTipo">Tipo</label>
                <select class="form-select form-select-sm" id="archivoTipo">
                  <option value="tickets" selected>Tickets</option>
                  <option value="facturas">Facturas</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label" for="archivoDesde">Desde</label>
                <input type="date" class="form-control form-control-sm" id="archivoDesde" value="${start}" required>
              </div>
              <div class="col-md-3">
                <label class="form-label" for="archivoHasta">Hasta</label>
                <input type="date" class="form-control form-control-sm" id="archivoHasta" value="${end}" required>
              </div>
              <div class="col-md-3">
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
              <thead id="archivoTableHead"></thead>
              <tbody id="archivoTableBody">
                <tr><td colspan="${TICKET_COL_SPAN}" class="text-center text-muted">Cargando...</td></tr>
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
            <button type="button" class="btn btn-outline-primary btn-sm" id="archivoTicketDownloadBtn">
              <i class="fa-solid fa-download me-1"></i>Descargar imagen
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal fade" id="archivoFacturaModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="archivoFacturaModalLabel">Detalle de factura</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body py-2" id="archivoFacturaModalBody"></div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await bindLogout();

  detailModal = new bootstrap.Modal(document.getElementById('archivoTicketModal'));
  facturaDetailModal = new bootstrap.Modal(document.getElementById('archivoFacturaModal'));
  const archivoTicketModalContent = document.querySelector('#archivoTicketModal .modal-content');
  const archivoTicketDownloadBtn = document.getElementById('archivoTicketDownloadBtn');
  bindTicketDetailImageDownload(archivoTicketDownloadBtn, archivoTicketModalContent);
  const tableHead = document.getElementById('archivoTableHead');
  const tableBody = document.getElementById('archivoTableBody');

  function currentColSpan() {
    return archiveMode === 'facturas' ? FACTURA_COL_SPAN : TICKET_COL_SPAN;
  }

  function updateArchiveChrome() {
    const isFacturas = archiveMode === 'facturas';
    document.getElementById('archivoCardTitle').innerHTML = isFacturas
      ? '<i class="fa-solid fa-file-invoice-dollar me-2"></i>Archivo de facturas'
      : '<i class="fa-solid fa-box-archive me-2"></i>Archivo de tickets';
    document.getElementById('archivoSearch').placeholder = isFacturas
      ? 'Buscar facturas en la tabla…'
      : 'Buscar tickets en la tabla…';

    if (isFacturas) {
      tableHead.innerHTML = `
        <tr>
          <th>No.</th>
          <th>Fecha</th>
          <th>Cliente</th>
          <th>Serie</th>
          <th>Número</th>
          <th class="text-end">Importe</th>
          <th>Pagada</th>
          <th>Fecha pago</th>
          <th>Ticket</th>
          <th class="text-end">Acciones</th>
        </tr>`;
    } else {
      tableHead.innerHTML = `
        <tr>
          <th>Inicio</th>
          <th>Fin</th>
          <th>Empleado</th>
          <th>Cliente</th>
          <th>Reporte cliente</th>
          <th class="text-end">Importe</th>
          <th>Status</th>
          <th class="text-end">Acciones</th>
        </tr>`;
    }
  }

  function openFacturaDetailModal(factura) {
    document.getElementById('archivoFacturaModalLabel').textContent = `Factura ${facturaNumeroLabel(factura)}`;
    document.getElementById('archivoFacturaModalBody').innerHTML = renderFacturaDetailHtml(factura);
    facturaDetailModal.show();
  }

  function openDetailModal(ticket) {
    document.getElementById('archivoTicketModalLabel').textContent = `Ticket #${ticket.id}`;
    const body = document.getElementById('archivoTicketModalBody');
    body.innerHTML = renderTicketDetailHtml(ticket);
    archivoTicketDownloadBtn.dataset.ticketId = ticket.id;
    bindPhotoZoom(body);
    detailModal.show();
  }

  function getVisibleTickets() {
    return tickets.filter((t) => matchesTicketSearch(t, searchQuery));
  }

  function getVisibleFacturas() {
    return facturas.filter((f) => matchesFacturaSearch(f, searchQuery));
  }

  function updateTotalImporte(items, amountKey = 'totalprecio') {
    const total = items.reduce(
      (sum, item) => sum + (item[amountKey] != null ? Number(item[amountKey]) : 0),
      0
    );
    document.getElementById('archivoTotalImporte').textContent = formatImporte(total);
  }

  function bindFacturaRowActions() {
    document.querySelectorAll('.btn-archivo-ver-factura').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idfac = Number(btn.dataset.idfac);
        try {
          const factura = await api.getFactura(idfac);
          openFacturaDetailModal(factura);
        } catch (err) {
          toastError(err.message);
        }
      });
    });
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

  function renderTicketsTable() {
    const visible = getVisibleTickets();
    updateTotalImporte(visible, 'totalprecio');

    if (!tickets.length) {
      tableBody.innerHTML =
        `<tr><td colspan="${currentColSpan()}" class="text-center text-muted">No hay tickets en el rango seleccionado.</td></tr>`;
      return;
    }

    if (!visible.length) {
      tableBody.innerHTML =
        `<tr><td colspan="${currentColSpan()}" class="text-center text-muted">No hay tickets con ese criterio de búsqueda.</td></tr>`;
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

  function renderFacturasTable() {
    const visible = getVisibleFacturas();
    updateTotalImporte(visible, 'total');

    if (!facturas.length) {
      tableBody.innerHTML =
        `<tr><td colspan="${currentColSpan()}" class="text-center text-muted">No hay facturas en el rango seleccionado.</td></tr>`;
      return;
    }

    if (!visible.length) {
      tableBody.innerHTML =
        `<tr><td colspan="${currentColSpan()}" class="text-center text-muted">No hay facturas con ese criterio de búsqueda.</td></tr>`;
      return;
    }

    tableBody.innerHTML = visible
      .map(
        (f) => `
        <tr>
          <td>${escapeHtml(facturaNumeroLabel(f))}</td>
          <td class="text-nowrap">${escapeHtml(formatDate(f.fecha))}</td>
          <td>${escapeHtml(f.cliente)}</td>
          <td>${escapeHtml(f.serie || '—')}</td>
          <td>${escapeHtml(f.numero || '—')}</td>
          <td class="text-end text-nowrap">${escapeHtml(formatImporte(f.total))}</td>
          <td>${escapeHtml(pagadaLabel(f.pagada))}</td>
          <td class="text-nowrap">${f.fecha_pagada ? escapeHtml(formatDate(f.fecha_pagada)) : '—'}</td>
          <td>${f.ticket_id ? escapeHtml(String(f.ticket_id)) : '—'}</td>
          <td class="text-end">
            <button type="button" class="btn btn-outline-primary btn-sm btn-archivo-ver-factura" data-idfac="${f.idfac}" title="Ver detalle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </td>
        </tr>`
      )
      .join('');
    bindFacturaRowActions();
  }

  function renderTable() {
    if (archiveMode === 'facturas') {
      renderFacturasTable();
    } else {
      renderTicketsTable();
    }
  }

  async function exportTicketsToExcel(visible, desde, hasta) {
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
    await exportRowsToExcel(rows, 'Tickets', `archivo-tickets_${desde}_${hasta}.xlsx`);
  }

  async function exportFacturasToExcel(visible, desde, hasta) {
    const rows = [
      ['No.', 'Fecha', 'Cliente', 'Serie', 'Número', 'Importe', 'Pagada', 'Fecha pago', 'Ticket'],
      ...visible.map((f) => [
        facturaNumeroLabel(f),
        formatDate(f.fecha),
        f.cliente || '',
        f.serie || '',
        f.numero || '',
        f.total != null ? Number(f.total) : '',
        pagadaLabel(f.pagada),
        f.fecha_pagada ? formatDate(f.fecha_pagada) : '',
        f.ticket_id || '',
      ]),
    ];
    await exportRowsToExcel(rows, 'Facturas', `archivo-facturas_${desde}_${hasta}.xlsx`);
  }

  async function exportToExcel() {
    const desde = document.getElementById('archivoDesde').value;
    const hasta = document.getElementById('archivoHasta').value;
    const visible = archiveMode === 'facturas' ? getVisibleFacturas() : getVisibleTickets();

    if (!visible.length) {
      toastError('No hay datos para exportar con el filtro actual.');
      return;
    }

    try {
      if (archiveMode === 'facturas') {
        await exportFacturasToExcel(visible, desde, hasta);
      } else {
        await exportTicketsToExcel(visible, desde, hasta);
      }
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

    tableBody.innerHTML =
      `<tr><td colspan="${currentColSpan()}" class="text-center text-muted">Cargando...</td></tr>`;

    try {
      searchQuery = document.getElementById('archivoSearch').value.trim();
      if (archiveMode === 'facturas') {
        facturas = await api.listFacturasArchivo(desde, hasta);
        tickets = [];
      } else {
        tickets = await api.listTicketsArchivo(desde, hasta);
        facturas = [];
      }
      renderTable();
    } catch (err) {
      tableBody.innerHTML =
        `<tr><td colspan="${currentColSpan()}" class="text-center text-danger">Error al cargar</td></tr>`;
      document.getElementById('archivoTotalImporte').textContent = formatImporte(0);
      toastError(err.message);
    }
  }

  function onArchiveModeChange() {
    archiveMode = document.getElementById('archivoTipo').value;
    searchQuery = '';
    document.getElementById('archivoSearch').value = '';
    updateArchiveChrome();
    loadList();
  }

  updateArchiveChrome();

  document.getElementById('archivoTipo').addEventListener('change', onArchiveModeChange);
  document.getElementById('archivoDesde').addEventListener('change', loadList);
  document.getElementById('archivoHasta').addEventListener('change', loadList);
  document.getElementById('archivoSearch').addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderTable();
  });
  document.getElementById('btnArchivoExportar').addEventListener('click', exportToExcel);

  await loadList();
}
