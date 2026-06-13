import * as api from '../api.js';

import { updateAppShell, bindLogout } from '../components/layout.js';

import { toastSuccess, toastError, confirmDeleteWithClave } from '../alerts.js';

import { runFormAction } from '../form-actions.js';

import { mountFloatingFab } from '../components/fab.js';
import { initClienteMap, destroyClienteMap } from '../components/cliente-map.js';



function escapeHtml(text) {

  if (text === null || text === undefined) return '';

  const div = document.createElement('div');

  div.textContent = String(text);

  return div.innerHTML;

}



function formatCoord(v) {

  return v === null || v === undefined ? '—' : v;

}



function facCell(c) {

  const parts = [c.fac_nit, c.fac_nombre, c.fac_direccion].filter((v) => v && String(v).trim());

  if (!parts.length) return '<span class="text-muted">—</span>';

  return `<div class="cliente-fac-mini">${parts.map((p) => escapeHtml(p)).join('<br>')}</div>`;

}



export async function renderClients(root) {

  updateAppShell('clientes', 'Clientes');

  root.innerHTML = `

    <main class="container-fluid py-2">

      <div class="mb-2">

        <h1 class="h6 mb-0">Gestión de clientes</h1>

      </div>

      <div class="table-responsive">

        <table class="table table-sm table-striped table-hover small mb-0">

          <thead class="table-app">

            <tr>

              <th>Código</th><th>Empresa</th><th>Cliente</th><th>Teléfono</th><th>Dirección</th>

              <th>Facturación</th><th>Lat</th><th>Lng</th><th class="text-end">Acciones</th>

            </tr>

          </thead>

          <tbody id="clientesTableBody"><tr><td colspan="9" class="text-center text-muted">Cargando...</td></tr></tbody>

        </table>

      </div>

    </main>

    <div class="modal fade" id="clienteModal" tabindex="-1">

      <div class="modal-dialog modal-dialog-scrollable modal-lg">

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

            <div class="border rounded p-2 mb-2 bg-light-subtle">

              <p class="small fw-semibold mb-2 text-muted">Datos de facturación</p>

              <div class="mb-2">

                <label class="form-label" for="clienteFacNit">NIT facturación</label>

                <input type="text" class="form-control form-control-sm" id="clienteFacNit" maxlength="50">

              </div>

              <div class="mb-2">

                <label class="form-label" for="clienteFacNombre">Nombre facturación</label>

                <input type="text" class="form-control form-control-sm" id="clienteFacNombre" maxlength="255">

              </div>

              <div class="mb-0">

                <label class="form-label" for="clienteFacDireccion">Dirección facturación</label>

                <input type="text" class="form-control form-control-sm" id="clienteFacDireccion" maxlength="500">

              </div>

            </div>

            <div class="mb-2">

              <label class="form-label">Ubicación en mapa</label>

              <div id="clienteMap" class="cliente-map-wrap"></div>

              <p class="small text-muted mb-0 mt-1">Arrastre el pin para ajustar latitud y longitud.</p>

            </div>

            <div class="row g-2">

              <div class="col-6">

                <label class="form-label" for="clienteLatitud">Latitud</label>

                <input type="number" step="any" class="form-control form-control-sm" id="clienteLatitud" readonly>

              </div>

              <div class="col-6">

                <label class="form-label" for="clienteLongitud">Longitud</label>

                <input type="number" step="any" class="form-control form-control-sm" id="clienteLongitud" readonly>

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
  const modalEl = document.getElementById('clienteModal');
  const tableBody = document.getElementById('clientesTableBody');
  let pendingMapCoords = { lat: null, lng: null };

  modalEl.addEventListener('shown.bs.modal', async () => {
    await initClienteMap({
      containerId: 'clienteMap',
      lat: pendingMapCoords.lat,
      lng: pendingMapCoords.lng,
    });
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    destroyClienteMap();
  });



  function openModal(cliente = null) {

    document.getElementById('clienteForm').reset();

    document.getElementById('codigoDisplayGroup').style.display = cliente ? 'block' : 'none';

    if (cliente) {

      document.getElementById('clienteModalLabel').textContent = 'Editar cliente';

      document.getElementById('clienteCodigo').value = cliente.codigo;

      document.getElementById('clienteCodigoDisplay').value = cliente.codigo;

      document.getElementById('clienteNombreEmpresa').value = cliente.nombre_empresa;

      document.getElementById('clienteNombreCliente').value = cliente.nombre_cliente;

      document.getElementById('clienteTelefono').value = cliente.telefono || '';

      document.getElementById('clienteDireccion').value = cliente.direccion;

      document.getElementById('clienteFacNit').value = cliente.fac_nit || '';

      document.getElementById('clienteFacNombre').value = cliente.fac_nombre || '';

      document.getElementById('clienteFacDireccion').value = cliente.fac_direccion || '';

      pendingMapCoords = {
        lat: cliente.latitud !== null ? cliente.latitud : null,
        lng: cliente.longitud !== null ? cliente.longitud : null,
      };

    } else {

      document.getElementById('clienteModalLabel').textContent = 'Nuevo cliente';

      document.getElementById('clienteCodigo').value = '';

      pendingMapCoords = { lat: null, lng: null };

    }

    modal.show();

  }



  async function load() {

    try {

      const clientes = await api.listClientes();

      if (!clientes.length) {

        tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Sin registros</td></tr>';

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

          <td>${escapeHtml(c.telefono || '—')}</td>

          <td>${escapeHtml(c.direccion)}</td>

          <td>${facCell(c)}</td>

          <td>${formatCoord(c.latitud)}</td>

          <td>${formatCoord(c.longitud)}</td>

          <td class="text-end">

            <div class="d-grid gap-1 d-md-block">

              <button class="btn btn-outline-primary btn-sm btn-edit" data-codigo="${c.codigo}">

                <i class="fa-solid fa-pen me-1"></i>Editar

              </button>

              <button class="btn btn-outline-danger btn-sm btn-delete" data-codigo="${c.codigo}">

                <i class="fa-solid fa-trash me-1"></i>Eliminar

              </button>

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

          const clave = await confirmDeleteWithClave('Eliminar cliente', '¿Confirma la eliminación?');

          if (!clave) return;

          try {

            await api.deleteCliente(codigo, clave);

            toastSuccess('Cliente eliminado');

            await load();

          } catch (err) {

            toastError(err.message);

          }

        });

      });

    } catch (err) {

      tableBody.innerHTML = '<tr><td colspan="9" class="text-danger text-center">Error al cargar</td></tr>';

      toastError(err.message);

    }

  }



  const fabBtn = mountFloatingFab({ id: 'btnFabNuevoCliente', ariaLabel: 'Nuevo cliente' });

  fabBtn.addEventListener('click', () => openModal());



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

      fac_nit: document.getElementById('clienteFacNit').value.trim() || null,

      fac_nombre: document.getElementById('clienteFacNombre').value.trim() || null,

      fac_direccion: document.getElementById('clienteFacDireccion').value.trim() || null,

      latitud: document.getElementById('clienteLatitud').value,

      longitud: document.getElementById('clienteLongitud').value,

    };

    const loadingText = codigo ? 'Guardando…' : 'Creando…';

    await runFormAction('clienteForm', loadingText, async () => {

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

  });



  await load();

}

