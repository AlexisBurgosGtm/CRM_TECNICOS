import * as api from '../api.js';
import { updateAppShell, bindLogout } from '../components/layout.js';
import { toastSuccess, toastError, confirmAction } from '../alerts.js';

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function formatCoord(v) {
  return v === null || v === undefined ? '—' : v;
}

export async function renderClients(root) {
  updateAppShell('clientes', 'Clientes');
  root.innerHTML = `
    <main class="container-fluid py-2">
      <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-2">
        <h1 class="h6 mb-0">Gestión de clientes</h1>
        <button type="button" class="btn btn-primary btn-sm" id="btnNuevoCliente">Nuevo cliente</button>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-striped table-hover small mb-0">
          <thead class="table-app">
            <tr>
              <th>Código</th><th>Empresa</th><th>Cliente</th><th>Teléfono</th><th>Dirección</th>
              <th>Lat</th><th>Lng</th><th class="text-end">Acciones</th>
            </tr>
          </thead>
          <tbody id="clientesTableBody"><tr><td colspan="8" class="text-center text-muted">Cargando...</td></tr></tbody>
        </table>
      </div>
    </main>
    <div class="modal fade" id="clienteModal" tabindex="-1">
      <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content small">
          <div class="modal-header modal-header-app py-2">
            <h5 class="modal-title" id="clienteModalLabel">Cliente</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <form id="clienteForm" class="modal-body py-2">
            <input type="hidden" id="clienteCodigo">
            <div class="mb-2" id="codigoDisplayGroup" style="display:none">
              <label class="form-label">Código</label>
              <input type="text" class="form-control form-control-sm" id="clienteCodigoDisplay" readonly>
            </div>
            <div class="mb-2">
              <label class="form-label" for="clienteNombreEmpresa">Nombre de la empresa</label>
              <input type="text" class="form-control form-control-sm" id="clienteNombreEmpresa" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="clienteNombreCliente">Nombre del cliente</label>
              <input type="text" class="form-control form-control-sm" id="clienteNombreCliente" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="clienteTelefono">Teléfono (8 dígitos)</label>
              <input type="tel" class="form-control form-control-sm" id="clienteTelefono"
                pattern="\\d{8}" maxlength="8" inputmode="numeric" required>
            </div>
            <div class="mb-2">
              <label class="form-label" for="clienteDireccion">Dirección</label>
              <input type="text" class="form-control form-control-sm" id="clienteDireccion" required>
            </div>
            <div class="row g-2">
              <div class="col-6">
                <label class="form-label" for="clienteLatitud">Latitud</label>
                <input type="number" step="any" class="form-control form-control-sm" id="clienteLatitud">
              </div>
              <div class="col-6">
                <label class="form-label" for="clienteLongitud">Longitud</label>
                <input type="number" step="any" class="form-control form-control-sm" id="clienteLongitud">
              </div>
            </div>
          </form>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" form="clienteForm" class="btn btn-primary btn-sm">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  await bindLogout();

  const modal = new bootstrap.Modal(document.getElementById('clienteModal'));
  const tableBody = document.getElementById('clientesTableBody');

  function openModal(cliente = null) {
    document.getElementById('clienteForm').reset();
    document.getElementById('codigoDisplayGroup').style.display = cliente ? 'block' : 'none';
    if (cliente) {
      document.getElementById('clienteModalLabel').textContent = 'Editar cliente';
      document.getElementById('clienteCodigo').value = cliente.codigo;
      document.getElementById('clienteCodigoDisplay').value = cliente.codigo;
      document.getElementById('clienteNombreEmpresa').value = cliente.nombre_empresa;
      document.getElementById('clienteNombreCliente').value = cliente.nombre_cliente;
      document.getElementById('clienteDireccion').value = cliente.direccion;
      document.getElementById('clienteLatitud').value =
        cliente.latitud !== null ? cliente.latitud : '';
      document.getElementById('clienteLongitud').value =
        cliente.longitud !== null ? cliente.longitud : '';
    } else {
      document.getElementById('clienteModalLabel').textContent = 'Nuevo cliente';
      document.getElementById('clienteCodigo').value = '';
    }
    modal.show();
  }

  async function load() {
    try {
      const clientes = await api.listClientes();
      if (!clientes.length) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Sin registros</td></tr>';
        return;
      }
      let list = clientes;
      tableBody.innerHTML = clientes
        .map(
          (c) => `
        <tr>
          <td>${c.codigo}</td>
          <td>${escapeHtml(c.nombre_empresa)}</td>
          <td>${escapeHtml(c.nombre_cliente)}</td>
          <td>${escapeHtml(c.direccion)}</td>
          <td>${formatCoord(c.latitud)}</td>
          <td>${formatCoord(c.longitud)}</td>
          <td class="text-end">
            <div class="d-grid gap-1 d-md-block">
              <button class="btn btn-outline-primary btn-sm btn-edit" data-codigo="${c.codigo}">Editar</button>
              <button class="btn btn-outline-danger btn-sm btn-delete" data-codigo="${c.codigo}">Eliminar</button>
            </div>
          </td>
        </tr>`
        )
        .join('');

      document.querySelectorAll('.btn-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const c = list.find((x) => x.codigo === Number(btn.dataset.codigo));
          if (c) openModal(c);
        });
      });
      document.querySelectorAll('.btn-delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const codigo = Number(btn.dataset.codigo);
          const ok = await confirmAction('Eliminar cliente', '¿Confirma la eliminación?');
          if (!ok) return;
          try {
            await api.deleteCliente(codigo);
            toastSuccess('Cliente eliminado');
            await load();
          } catch (err) {
            toastError(err.message);
          }
        });
      });
    } catch (err) {
      tableBody.innerHTML = '<tr><td colspan="8" class="text-danger text-center">Error al cargar</td></tr>';
      toastError(err.message);
    }
  }

  document.getElementById('btnNuevoCliente').addEventListener('click', () => openModal());

  document.getElementById('clienteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('clienteCodigo').value;
    const telefono = document.getElementById('clienteTelefono').value.trim();
    if (!/^\d{8}$/.test(telefono)) {
      toastError('El teléfono debe tener exactamente 8 dígitos.');
      return;
    }
    const body = {
      nombre_empresa: document.getElementById('clienteNombreEmpresa').value.trim(),
      nombre_cliente: document.getElementById('clienteNombreCliente').value.trim(),
      telefono,
      direccion: document.getElementById('clienteDireccion').value.trim(),
      latitud: document.getElementById('clienteLatitud').value,
      longitud: document.getElementById('clienteLongitud').value,
    };
    try {
      if (codigo) {
        await api.updateCliente({ codigo: Number(codigo), ...body });
        toastSuccess('Cliente actualizado');
      } else {
        await api.createCliente(body);
        toastSuccess('Cliente creado');
      }
      modal.hide();
      await load();
    } catch (err) {
      toastError(err.message);
    }
  });

  await load();
}
