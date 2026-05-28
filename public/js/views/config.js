import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { confirmAction, toastError, toastSuccess } from '../alerts.js';

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

export async function renderConfig(root) {
  updateAppShell('config', 'Config');
  const { start, end } = monthRange();

  root.innerHTML = `
    <main class="container-fluid py-2 config-page">
      <div class="row g-3">
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header card-header-app py-2">
              <h2 class="h6 mb-0"><i class="fa-solid fa-images me-2"></i>Fotos de tickets</h2>
            </div>
            <div class="card-body py-3">
              <p class="form-label mb-2 fw-semibold">Eliminar fotos del:</p>
              <div class="row g-2 align-items-end">
                <div class="col-sm-5">
                  <label class="form-label visually-hidden" for="configFotosDesde">Fecha inicial</label>
                  <input type="date" class="form-control form-control-sm" id="configFotosDesde" value="${start}" required>
                </div>
                <div class="col-sm-5">
                  <label class="form-label visually-hidden" for="configFotosHasta">Fecha final</label>
                  <input type="date" class="form-control form-control-sm" id="configFotosHasta" value="${end}" required>
                </div>
                <div class="col-sm-2">
                  <button type="button" class="btn btn-danger btn-sm w-100" id="btnEliminarFotos">
                    <i class="fa-solid fa-trash me-1"></i>Eliminar
                  </button>
                </div>
              </div>
              <p class="small text-muted mt-2 mb-0">
                Se eliminarán los archivos de fotos de tickets con fecha de inicio dentro del rango indicado.
              </p>
            </div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm h-100 config-panel-right">
            <div class="card-body d-flex align-items-center justify-content-center text-muted small">
              Panel disponible para futuras opciones.
            </div>
          </div>
        </div>
      </div>
    </main>
  `;

  await bindLogout();

  document.getElementById('btnEliminarFotos').addEventListener('click', async () => {
    const startDate = document.getElementById('configFotosDesde').value;
    const endDate = document.getElementById('configFotosHasta').value;
    if (!startDate || !endDate) {
      toastError('Seleccione el rango de fechas.');
      return;
    }
    if (startDate > endDate) {
      toastError('La fecha inicial no puede ser mayor que la final.');
      return;
    }

    const ok = await confirmAction(
      'Eliminar fotos',
      `¿Confirma eliminar las fotos de tickets con fecha de inicio del ${startDate} al ${endDate}?`
    );
    if (!ok) return;

    try {
      const result = await api.deleteTicketPhotosInRange(startDate, endDate);
      toastSuccess(
        `Fotos eliminadas: ${result.filesDeleted} archivo(s) en ${result.tickets} ticket(s).`
      );
    } catch (err) {
      toastError(err.message);
    }
  });
}
