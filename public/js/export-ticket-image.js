let html2canvasPromise = null;

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (!html2canvasPromise) {
    html2canvasPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = () => resolve(window.html2canvas);
      script.onerror = () => reject(new Error('No se pudo cargar la herramienta de captura.'));
      document.head.appendChild(script);
    });
  }
  return html2canvasPromise;
}

export async function downloadTicketDetailImage(modalContentEl, ticketId) {
  if (!modalContentEl) throw new Error('No se encontró el contenido del modal.');

  const html2canvas = await loadHtml2Canvas();
  const dialog = modalContentEl.closest('.modal-dialog');
  const body = modalContentEl.querySelector('.modal-body');
  const footer = modalContentEl.querySelector('.modal-footer');
  const closeBtn = modalContentEl.querySelector('.btn-close');

  const prev = {
    dialogMaxHeight: dialog?.style.maxHeight ?? '',
    bodyMaxHeight: body?.style.maxHeight ?? '',
    bodyOverflow: body?.style.overflow ?? '',
    footerDisplay: footer?.style.display ?? '',
    closeDisplay: closeBtn?.style.display ?? '',
  };

  if (dialog) dialog.style.maxHeight = 'none';
  if (body) {
    body.style.maxHeight = 'none';
    body.style.overflow = 'visible';
  }
  if (footer) footer.style.display = 'none';
  if (closeBtn) closeBtn.style.display = 'none';

  try {
    const canvas = await html2canvas(modalContentEl, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      scrollY: -window.scrollY,
    });

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `ticket-${ticketId}.png`;
    link.click();
  } finally {
    if (dialog) dialog.style.maxHeight = prev.dialogMaxHeight;
    if (body) {
      body.style.maxHeight = prev.bodyMaxHeight;
      body.style.overflow = prev.bodyOverflow;
    }
    if (footer) footer.style.display = prev.footerDisplay;
    if (closeBtn) closeBtn.style.display = prev.closeDisplay;
  }
}
