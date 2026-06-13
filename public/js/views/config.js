import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { confirmDeleteWithClave, toastError, toastSuccess } from '../alerts.js';
import { getEmpresaNombre, isSuperUser } from '../auth.js';

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

function buildDatabaseSizeCard() {
  return `
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header card-header-app py-2">
              <h2 class="h6 mb-0"><i class="fa-solid fa-database me-2"></i>Tamaño de base de datos</h2>
            </div>
            <div class="card-body py-3 d-flex flex-column justify-content-center">
              <p class="display-6 fw-semibold mb-1" id="configDbSizeValue">—</p>
              <p class="small text-muted mb-0" id="configDbSizeHint">Calculando…</p>
            </div>
          </div>
        </div>`;
}

export async function renderConfig(root) {
  updateAppShell('config', 'Config');
  const { start, end } = monthRange();
  const superUser = isSuperUser();
  const empresaActiva = getEmpresaNombre();

  root.innerHTML = `
    <main class="container-fluid py-2 config-page">
      <div class="row g-3">
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header card-header-app py-2">
              <h2 class="h6 mb-0"><i class="fa-solid fa-images me-2"></i>Fotos de tickets</h2>
            </div>
            <div class="card-body py-3">
              <p class="small text-muted mb-2" id="configFotosEmpresaLabel">Empresa: ${empresaActiva || '—'}</p>
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
                Solo se eliminan fotos de tickets de la empresa en uso (${empresaActiva || 'sesión actual'})
                con fecha de inicio dentro del rango indicado.
              </p>
            </div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header card-header-app py-2">
              <h2 class="h6 mb-0"><i class="fa-solid fa-key me-2"></i>Clave de eliminación</h2>
            </div>
            <div class="card-body py-3">
              <p class="small text-muted mb-2" id="configClaveEmpresaLabel">Empresa activa</p>
              <div class="mb-2">
                <span class="badge text-bg-light border" id="configClaveEstado">Verificando…</span>
              </div>
              <form id="configClaveForm" autocomplete="off" data-lpignore="true">
                <label class="form-label" for="configClaveInput">Nueva clave</label>
                <input type="text" class="form-control form-control-sm mb-2 config-clave-mask" id="configClaveInput"
                  maxlength="64" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                  data-lpignore="true" data-1p-ignore data-form-type="other" inputmode="text" readonly
                  placeholder="Clave para autorizar eliminaciones" required>
                <p class="small text-muted mb-3">
                  Esta clave se solicitará al eliminar empleados, clientes, tickets, fotos u otros registros de la empresa.
                </p>
                <button type="submit" class="btn btn-primary btn-sm" id="btnGuardarClave">
                  <i class="fa-solid fa-floppy-disk me-1"></i>Guardar clave
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
      ${superUser ? `<div class="row g-3 mt-0">${buildDatabaseSizeCard()}</div>` : ''}
    </main>
  `;

  await bindLogout();

  const claveInput = document.getElementById('configClaveInput');
  claveInput.addEventListener('focus', () => claveInput.removeAttribute('readonly'));

  const empresaLabel = document.getElementById('configClaveEmpresaLabel');
  const estadoBadge = document.getElementById('configClaveEstado');

  async function loadClaveStatus() {
    try {
      const status = await api.getEmpresaClaveStatus();
      empresaLabel.textContent = `Empresa: ${status.empresa || getEmpresaNombre() || status.empnit}`;
      document.getElementById('configFotosEmpresaLabel').textContent =
        `Empresa: ${status.empresa || getEmpresaNombre() || status.empnit}`;
      if (status.configurada) {
        estadoBadge.textContent = 'Clave configurada';
        estadoBadge.className = 'badge badge-estado-activo';
      } else {
        estadoBadge.textContent = 'Sin clave configurada';
        estadoBadge.className = 'badge badge-estado-inactivo';
      }
    } catch (err) {
      estadoBadge.textContent = 'No disponible';
      estadoBadge.className = 'badge text-bg-light border';
      toastError(err.message);
    }
  }

  if (superUser) {
    const dbSizeValue = document.getElementById('configDbSizeValue');
    const dbSizeHint = document.getElementById('configDbSizeHint');
    try {
      const { size_mb: sizeMb } = await api.getDatabaseSize();
      dbSizeValue.textContent = `${Number(sizeMb).toFixed(2)} MB`;
      dbSizeHint.textContent = 'Tamaño total de las tablas en MySQL';
    } catch (err) {
      dbSizeValue.textContent = '—';
      dbSizeHint.textContent = err.message || 'No se pudo obtener el tamaño';
    }
  }

  document.getElementById('configClaveForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const clave = document.getElementById('configClaveInput').value.trim();
    if (!clave) {
      toastError('Ingrese la clave.');
      return;
    }
    const btn = document.getElementById('btnGuardarClave');
    btn.disabled = true;
    try {
      await api.updateEmpresaClave(clave);
      claveInput.value = '';
      claveInput.setAttribute('readonly', '');
      toastSuccess('Clave de eliminación actualizada');
      await loadClaveStatus();
    } catch (err) {
      toastError(err.message);
    } finally {
      btn.disabled = false;
    }
  });

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

    const empresa = getEmpresaNombre() || 'la empresa en uso';
    const clave = await confirmDeleteWithClave(
      'Eliminar fotos',
      `¿Confirma eliminar las fotos de tickets de ${empresa} con fecha de inicio del ${startDate} al ${endDate}?`
    );
    if (!clave) return;

    try {
      const result = await api.deleteTicketPhotosInRange(startDate, endDate, clave);
      toastSuccess(
        `Fotos eliminadas (${empresa}): ${result.filesDeleted} archivo(s) en ${result.tickets} ticket(s).`
      );
    } catch (err) {
      toastError(err.message);
    }
  });

  await loadClaveStatus();
}
