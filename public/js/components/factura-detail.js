import { formatDate, formatImporte } from '../format.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function facturaNumeroLabel(f) {
  if (f.serie && f.numero) return `${f.serie}-${f.numero}`;
  if (f.numero) return String(f.numero);
  return String(f.idfac ?? f.id ?? '—');
}

function pagadaLabel(pagada) {
  return String(pagada || 'NO').toUpperCase() === 'SI' ? 'SI' : 'NO';
}

export function renderFacturaDetailHtml(f) {
  const facParts = [f.fac_nit, f.fac_nombre, f.fac_direccion].filter((v) => v && String(v).trim());
  return `
    <dl class="row mb-0 small">
      <dt class="col-sm-4">No.</dt><dd class="col-sm-8">${escapeHtml(facturaNumeroLabel(f))}</dd>
      <dt class="col-sm-4">ID interno</dt><dd class="col-sm-8">${escapeHtml(String(f.idfac ?? f.id ?? '—'))}</dd>
      <dt class="col-sm-4">Fecha</dt><dd class="col-sm-8">${escapeHtml(formatDate(f.fecha))}</dd>
      <dt class="col-sm-4">Cliente</dt><dd class="col-sm-8">${escapeHtml(f.cliente || '—')}</dd>
      <dt class="col-sm-4">Importe</dt><dd class="col-sm-8">${escapeHtml(formatImporte(f.total))}</dd>
      <dt class="col-sm-4">Pagada</dt><dd class="col-sm-8">${escapeHtml(pagadaLabel(f.pagada))}</dd>
      <dt class="col-sm-4">Fecha de pago</dt><dd class="col-sm-8">${
        f.fecha_pagada ? escapeHtml(formatDate(f.fecha_pagada)) : '—'
      }</dd>
      <dt class="col-sm-4">Serie</dt><dd class="col-sm-8">${escapeHtml(f.serie || '—')}</dd>
      <dt class="col-sm-4">Número</dt><dd class="col-sm-8">${escapeHtml(f.numero || '—')}</dd>
      <dt class="col-sm-4">Ticket</dt><dd class="col-sm-8">${f.ticket_id ? escapeHtml(String(f.ticket_id)) : '—'}</dd>
      ${
        facParts.length
          ? `<dt class="col-sm-4">Datos facturación</dt><dd class="col-sm-8">${facParts
              .map((p) => escapeHtml(p))
              .join('<br>')}</dd>`
          : ''
      }
    </dl>`;
}
