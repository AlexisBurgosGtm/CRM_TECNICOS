import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { toastSuccess, toastError, confirmDeleteWithClave } from '../alerts.js';
import { runFormAction } from '../form-actions.js';
import { mountFloatingFab } from '../components/fab.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function activaBadge(activa) {
  const value = String(activa || 'SI').toUpperCase();
  if (value === 'SI') {
    return '<span class="badge badge-estado-activo">SI</span>';
  }
  return '<span class="badge badge-estado-inactivo">NO</span>';
}

export async function renderEmpresas(root) {
  updateAppShell('empresas', 'Empresas');
  root.innerHTML = `
    <main class="container-fluid py-2">
      <div class="mb-2">
        <h1 class="h6 mb-0">Gestión de empresas</h1>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-striped table-hover small mb-0">
          <thead class="table-app">
            <tr>
              <th>NIT</th>
              <th>Empresa</th>
              <th>Activa</th>
              <th class="text-end">Acciones</th>
            </tr>
          </thead>
          <tbody id="empresasTableBody">
            <tr><td colspan="4" class="text-center text-muted">Cargando...</td></tr>
          </tbody>
        </table>
      </div>
    </main>
    <div class="modal fade" id="empresaModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="empresaModalLabel">Empresa</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="empresaForm" class="modal-body py-2">
            <input type="hidden" id="empresaEmpnitOriginal">
            <div class="mb-2" id="empnitDisplayGroup" style="display:none">
              <label class="form-label">NIT</label>
              <input type="text" class="form-control form-control-sm" id="empresaEmpnitDisplay" readonly>
            </div>
            <div class="mb-2" id="empnitInputGroup">
              <label class="form-label" for="empresaEmpnit">NIT</label>
              <input type="text" class="form-control form-control-sm" id="empresaEmpnit" maxlength="50" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="empresaNombre">Empresa</label>
              <input type="text" class="form-control form-control-sm" id="empresaNombre" maxlength="255" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="empresaActiva">Activa</label>
              <select class="form-select form-select-sm" id="empresaActiva" required>
                <option value="SI">SI</option>
                <option value="NO">NO</option>
              </select>
            </div>
          </form>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" form="empresaForm" class="btn btn-primary btn-sm">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await bindLogout();

  const modal = new bootstrap.Modal(document.getElementById('empresaModal'));
  const tableBody = document.getElementById('empresasTableBody');

  function openModal(empresa = null) {
    const empnitInput = document.getElementById('empresaEmpnit');
    document.getElementById('empresaForm').reset();
    if (empresa) {
      document.getElementById('empresaModalLabel').textContent = 'Editar empresa';
      document.getElementById('empresaEmpnitOriginal').value = empresa.empnit;
      document.getElementById('empresaEmpnitDisplay').value = empresa.empnit;
      document.getElementById('empresaNombre').value = empresa.empresa || '';
      document.getElementById('empresaActiva').value = String(empresa.activa || 'SI').toUpperCase();
      document.getElementById('empnitDisplayGroup').style.display = 'block';
      document.getElementById('empnitInputGroup').style.display = 'none';
      empnitInput.removeAttribute('required');
      empnitInput.disabled = true;
    } else {
      document.getElementById('empresaModalLabel').textContent = 'Nueva empresa';
      document.getElementById('empresaEmpnitOriginal').value = '';
      document.getElementById('empnitDisplayGroup').style.display = 'none';
      document.getElementById('empnitInputGroup').style.display = 'block';
      document.getElementById('empresaActiva').value = 'SI';
      empnitInput.setAttribute('required', '');
      empnitInput.disabled = false;
    }
    modal.show();
  }

  async function load() {
    try {
      const empresas = await api.listEmpresas();
      if (!empresas.length) {
        tableBody.innerHTML =
          '<tr><td colspan="4" class="text-center text-muted">Sin registros</td></tr>';
        return;
      }
      const list = empresas;
      tableBody.innerHTML = empresas
        .map(
          (e) => `
        <tr>
          <td>${escapeHtml(e.empnit)}</td>
          <td>${escapeHtml(e.empresa || '—')}</td>
          <td>${activaBadge(e.activa)}</td>
          <td class="text-end">
            <div class="d-grid gap-1 d-md-block">
              <button class="btn btn-outline-primary btn-sm btn-edit" data-empnit="${escapeHtml(e.empnit)}">
                <i class="fa-solid fa-pen me-1"></i>Editar
              </button>
              <button class="btn btn-outline-danger btn-sm btn-delete" data-empnit="${escapeHtml(e.empnit)}">
                <i class="fa-solid fa-trash me-1"></i>Eliminar
              </button>
            </div>
          </td>
        </tr>`
        )
        .join('');

      document.querySelectorAll('.btn-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = list.find((x) => x.empnit === btn.dataset.empnit);
          if (item) openModal(item);
        });
      });
      document.querySelectorAll('.btn-delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const empnit = btn.dataset.empnit;
          const clave = await confirmDeleteWithClave(
            'Eliminar empresa',
            `¿Confirma la eliminación de la empresa ${empnit}?`
          );
          if (!clave) return;
          try {
            await api.deleteEmpresa(empnit, clave);
            toastSuccess('Empresa eliminada');
            await load();
          } catch (err) {
            toastError(err.message);
          }
        });
      });
    } catch (err) {
      tableBody.innerHTML =
        '<tr><td colspan="4" class="text-danger text-center">Error al cargar</td></tr>';
      toastError(err.message);
    }
  }

  const fabBtn = mountFloatingFab({ id: 'btnFabNuevaEmpresa', ariaLabel: 'Nueva empresa' });
  fabBtn.addEventListener('click', () => openModal());

  document.getElementById('empresaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const empnitOriginal = document.getElementById('empresaEmpnitOriginal').value.trim();
    const body = {
      empresa: document.getElementById('empresaNombre').value.trim(),
      activa: document.getElementById('empresaActiva').value,
    };
    const loadingText = empnitOriginal ? 'Guardando…' : 'Creando…';
    await runFormAction('empresaForm', loadingText, async () => {
      try {
        if (empnitOriginal) {
          await api.updateEmpresa({ empnit: empnitOriginal, ...body });
          toastSuccess('Empresa actualizada');
        } else {
          const empnit = document.getElementById('empresaEmpnit').value.trim();
          if (!empnit) {
            toastError('El NIT es obligatorio.');
            return;
          }
          await api.createEmpresa({ empnit, ...body });
          toastSuccess('Empresa creada');
        }
        modal.hide();
        await load();
      } catch (err) {
        toastError(err.message);
      }
    });
  });

  await load();
}
