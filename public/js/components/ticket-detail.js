import { formatDate, formatImporte } from '../format.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function photoUrl(filename) {
  if (!filename) return null;
  return `/FOTOS/${encodeURIComponent(filename)}`;
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

export function prioridadBadgeHtml(prioridad) {
  const label = prioridadLabel(prioridad);
  return `<span class="badge ${prioridadBadgeClass(prioridad)}">${escapeHtml(label)}</span>`;
}

export function statusBadge(status) {
  if (status === 'FINALIZADO') {
    return '<span class="badge badge-estatus-realizado">Finalizado</span>';
  }
  return '<span class="badge badge-estatus-pendiente">Pendiente</span>';
}

export function renderPhotoBlock(label, filename) {
  const url = photoUrl(filename);
  if (!url) {
    return `<div class="mb-2"><span class="text-muted">${escapeHtml(label)}: —</span></div>`;
  }
  return `
    <div class="mb-3">
      <div class="fw-semibold mb-1">${escapeHtml(label)}</div>
      <img src="${url}" alt="${escapeHtml(label)}" data-full-src="${url}"
        class="ticket-archivo-photo ticket-photo-zoomable img-fluid rounded border"
        role="button" title="Clic para ampliar">
      <div class="small text-muted mt-1">${escapeHtml(filename)}</div>
    </div>`;
}

export function renderTicketDetailHtml(ticket) {
  return `
    <dl class="row mb-3 small">
      <dt class="col-sm-3">Fecha inicio</dt><dd class="col-sm-9">${escapeHtml(formatDate(ticket.fecha_inicio))}</dd>
      <dt class="col-sm-3">Fecha fin</dt><dd class="col-sm-9">${escapeHtml(formatDate(ticket.fecha_fin))}</dd>
      <dt class="col-sm-3">Empleado</dt><dd class="col-sm-9">${escapeHtml(ticket.empleado_nombre || 'Sin asignar')}</dd>
      <dt class="col-sm-3">Nombre empresa</dt><dd class="col-sm-9">${escapeHtml(ticket.cliente_empresa || '—')}</dd>
      <dt class="col-sm-3">Nombre cliente</dt><dd class="col-sm-9">${escapeHtml(ticket.cliente_nombre || '—')}</dd>
      <dt class="col-sm-3">Teléfono cliente</dt><dd class="col-sm-9">${escapeHtml(ticket.cliente_telefono || '—')}</dd>
      <dt class="col-sm-3">Status</dt><dd class="col-sm-9">${statusBadge(ticket.status)}</dd>
      <dt class="col-sm-3">Prioridad</dt><dd class="col-sm-9">${prioridadBadgeHtml(ticket.prioridad)}</dd>
      <dt class="col-sm-3">Importe</dt><dd class="col-sm-9">${
        ticket.totalprecio != null ? escapeHtml(formatImporte(ticket.totalprecio)) : '—'
      }</dd>
      <dt class="col-sm-3">Reporte cliente</dt><dd class="col-sm-9 ticket-reporte-full">${escapeHtml(ticket.reporte_cliente || '—')}</dd>
      <dt class="col-sm-3">Reporte técnico</dt><dd class="col-sm-9">${escapeHtml(ticket.reporte_tecnico || '—')}</dd>
      <dt class="col-sm-3">Accesos</dt><dd class="col-sm-9">${escapeHtml(ticket.accesos || '—')}</dd>
      <dt class="col-sm-3">Notas</dt><dd class="col-sm-9">${escapeHtml(ticket.notas || '—')}</dd>
      <dt class="col-sm-3">Insumos</dt><dd class="col-sm-9">${escapeHtml(ticket.insumos || '—')}</dd>
    </dl>
    ${renderPhotoBlock('Foto 1', ticket.foto1)}
    ${renderPhotoBlock('Foto 2', ticket.foto2)}
    ${renderPhotoBlock('Foto 3', ticket.foto3)}
  `;
}

let photoLightboxModal = null;

function ensurePhotoLightbox() {
  if (document.getElementById('ticketPhotoLightbox')) return;

  document.body.insertAdjacentHTML(
    'beforeend',
    `
    <div class="modal fade" id="ticketPhotoLightbox" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-xl">
        <div class="modal-content bg-transparent border-0 shadow-none">
          <div class="modal-body p-2 text-center position-relative">
            <button type="button" class="btn-close btn-close-white position-absolute top-0 end-0 m-2"
              data-bs-dismiss="modal" aria-label="Cerrar"></button>
            <img id="ticketPhotoLightboxImg" src="" alt="" class="ticket-photo-lightbox-img img-fluid rounded">
          </div>
        </div>
      </div>
    </div>`
  );

  photoLightboxModal = new bootstrap.Modal(document.getElementById('ticketPhotoLightbox'));
}

export function bindPhotoZoom(container) {
  ensurePhotoLightbox();
  container.querySelectorAll('.ticket-photo-zoomable').forEach((img) => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      const src = img.dataset.fullSrc || img.src;
      const lightboxImg = document.getElementById('ticketPhotoLightboxImg');
      lightboxImg.src = src;
      lightboxImg.alt = img.alt || 'Foto';
      photoLightboxModal.show();
    });
  });
}
