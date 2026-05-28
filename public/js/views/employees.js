import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { toastSuccess, toastError, confirmAction } from '../alerts.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function tipoBadge(tipo) {
  const label = tipo === 'SUPERVISOR' ? 'Supervisor' : 'Técnico';
  return `<span class="badge text-bg-light border">${label}</span>`;
}

function estadoBadge(estado) {
  if (estado === 'INACTIVO') {
    return '<span class="badge badge-estado-inactivo">INACTIVO</span>';
  }
  return '<span class="badge badge-estado-activo">ACTIVO</span>';
}

function colorSwatch(color) {
  const c = color || '#7c3aed';
  return `<span class="empleado-color-swatch" style="background-color:${escapeHtml(c)}" title="${escapeHtml(c)}"></span>`;
}

export async function renderEmployees(root) {
  updateAppShell('empleados', 'Empleados');
  root.innerHTML = `
    <main class="container-fluid py-2">
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-2">
        <h1 class="h6 mb-0">Gestión de empleados</h1>
        <button type="button" class="btn btn-primary btn-sm" id="btnNuevoEmpleado">
          <i class="fa-solid fa-plus me-1"></i>Nuevo empleado
        </button>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-striped table-hover small mb-0">
          <thead class="table-app">
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th>Color</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th class="text-end">Acciones</th>
            </tr>
          </thead>
          <tbody id="empleadosTableBody">
            <tr><td colspan="7" class="text-center text-muted">Cargando...</td></tr>
          </tbody>
        </table>
      </div>
    </main>
    <div class="modal fade" id="empleadoModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="empleadoModalLabel">Empleado</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="empleadoForm" class="modal-body py-2">
            <input type="hidden" id="empleadoCodigo">
            <div class="mb-2" id="codigoDisplayGroup" style="display:none">
              <label class="form-label">Código</label>
              <input type="text" class="form-control form-control-sm" id="empleadoCodigoDisplay" readonly>
            </div>
            <div class="mb-2">
              <label class="form-label" for="empleadoNombre">Nombre</label>
              <input type="text" class="form-control form-control-sm" id="empleadoNombre" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="empleadoTelefono">Teléfono (8 dígitos)</label>
              <input type="tel" class="form-control form-control-sm" id="empleadoTelefono" pattern="\\d{8}" maxlength="8" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="empleadoClave">Clave</label>
              <input type="text" class="form-control form-control-sm" id="empleadoClave" minlength="1" maxlength="32" placeholder="Clave de acceso">
              <div class="form-text">Obligatoria al crear. Al editar, déjela en blanco para mantener la actual.</div>
            </div>
            <div class="mb-2">
              <label class="form-label" for="empleadoColor">Color</label>
              <div class="d-flex align-items-center gap-2">
                <input type="color" class="form-control form-control-color form-control-sm" id="empleadoColor" value="#7c3aed">
                <input type="text" class="form-control form-control-sm" id="empleadoColorHex" maxlength="7" pattern="#[0-9A-Fa-f]{6}" value="#7c3aed">
              </div>
            </div>
            <div class="mb-2">
              <label class="form-label" for="empleadoTipo">Tipo</label>
              <select class="form-select form-select-sm" id="empleadoTipo" required>
                <option value="TECNICO">Técnico</option>
                <option value="SUPERVISOR">Supervisor</option>
              </select>
            </div>
            <div class="mb-2">
              <label class="form-label" for="empleadoEstado">Estado</label>
              <select class="form-select form-select-sm" id="empleadoEstado" required>
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
              </select>
            </div>
          </form>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" form="empleadoForm" class="btn btn-primary btn-sm">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await bindLogout();

  const modal = new bootstrap.Modal(document.getElementById('empleadoModal'));
  const tableBody = document.getElementById('empleadosTableBody');
  const colorPicker = document.getElementById('empleadoColor');
  const colorHex = document.getElementById('empleadoColorHex');

  colorPicker.addEventListener('input', () => {
    colorHex.value = colorPicker.value;
  });
  colorHex.addEventListener('input', () => {
    if (/^#[0-9A-Fa-f]{6}$/.test(colorHex.value)) {
      colorPicker.value = colorHex.value;
    }
  });

  function openModal(empleado = null) {
    document.getElementById('empleadoForm').reset();
    document.getElementById('codigoDisplayGroup').style.display = empleado ? 'block' : 'none';
    colorPicker.value = '#7c3aed';
    colorHex.value = '#7c3aed';
    if (empleado) {
      document.getElementById('empleadoModalLabel').textContent = 'Editar empleado';
      document.getElementById('empleadoCodigo').value = empleado.codigo;
      document.getElementById('empleadoCodigoDisplay').value = empleado.codigo;
      document.getElementById('empleadoNombre').value = empleado.nombre;
      document.getElementById('empleadoTelefono').value = empleado.telefono;
      document.getElementById('empleadoClave').value = '';
      document.getElementById('empleadoClave').placeholder = 'Dejar en blanco para no cambiar';
      const color = empleado.color || '#7c3aed';
      colorPicker.value = color;
      colorHex.value = color;
      document.getElementById('empleadoTipo').value = empleado.tipo || 'TECNICO';
      document.getElementById('empleadoEstado').value = empleado.estado || 'ACTIVO';
    } else {
      document.getElementById('empleadoModalLabel').textContent = 'Nuevo empleado';
      document.getElementById('empleadoCodigo').value = '';
      document.getElementById('empleadoClave').placeholder = 'Clave de acceso';
      document.getElementById('empleadoTipo').value = 'TECNICO';
      document.getElementById('empleadoEstado').value = 'ACTIVO';
    }
    modal.show();
  }

  async function load() {
    try {
      const empleados = await api.listEmpleados();
      if (!empleados.length) {
        tableBody.innerHTML =
          '<tr><td colspan="7" class="text-center text-muted">Sin registros</td></tr>';
        return;
      }
      const list = empleados;
      tableBody.innerHTML = empleados
        .map(
          (e) => `
        <tr>
          <td>${e.codigo}</td>
          <td>${escapeHtml(e.nombre)}</td>
          <td>${escapeHtml(e.telefono)}</td>
          <td>${colorSwatch(e.color)}</td>
          <td>${tipoBadge(e.tipo)}</td>
          <td>${estadoBadge(e.estado)}</td>
          <td class="text-end">
            <div class="d-grid gap-1 d-md-block">
              <button class="btn btn-outline-primary btn-sm btn-edit" data-codigo="${e.codigo}">Editar</button>
              <button class="btn btn-outline-danger btn-sm btn-delete" data-codigo="${e.codigo}">Eliminar</button>
            </div>
          </td>
        </tr>`
        )
        .join('');

      document.querySelectorAll('.btn-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const emp = list.find((x) => x.codigo === Number(btn.dataset.codigo));
          if (emp) openModal(emp);
        });
      });
      document.querySelectorAll('.btn-delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const codigo = Number(btn.dataset.codigo);
          const ok = await confirmAction('Eliminar empleado', '¿Confirma la eliminación?');
          if (!ok) return;
          try {
            await api.deleteEmpleado(codigo);
            toastSuccess('Empleado eliminado');
            await load();
          } catch (err) {
            toastError(err.message);
          }
        });
      });
    } catch (err) {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="text-danger text-center">Error al cargar</td></tr>';
      toastError(err.message);
    }
  }

  document.getElementById('btnNuevoEmpleado').addEventListener('click', () => openModal());

  document.getElementById('empleadoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('empleadoCodigo').value;
    const clave = document.getElementById('empleadoClave').value.trim();
    const color = colorHex.value.trim();
    const body = {
      nombre: document.getElementById('empleadoNombre').value.trim(),
      telefono: document.getElementById('empleadoTelefono').value.trim(),
      tipo: document.getElementById('empleadoTipo').value,
      estado: document.getElementById('empleadoEstado').value,
      color,
    };
    if (!/^\d{8}$/.test(body.telefono)) {
      toastError('El teléfono debe tener 8 dígitos.');
      return;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      toastError('El color debe ser un valor hexadecimal válido (#RRGGBB).');
      return;
    }
    if (!codigo && !clave) {
      toastError('La clave es obligatoria al crear un empleado.');
      return;
    }
    if (clave) body.clave = clave;
    try {
      if (codigo) {
        await api.updateEmpleado({ codigo: Number(codigo), ...body });
        toastSuccess('Empleado actualizado');
      } else {
        await api.createEmpleado(body);
        toastSuccess('Empleado creado');
      }
      modal.hide();
      await load();
    } catch (err) {
      toastError(err.message);
    }
  });

  await load();
}
