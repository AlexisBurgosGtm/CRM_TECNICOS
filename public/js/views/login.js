import * as api from '../api.js';
import { setSession, getDefaultRoute } from '../auth.js';
import { navigate } from '../router.js';
import { showError, toastSuccess } from '../alerts.js';

export async function renderLogin(root) {
  root.innerHTML = `
    <div class="login-wrapper d-flex align-items-center justify-content-center min-vh-100 p-3">
      <div class="card shadow-sm border-0 login-card w-100">
        <div class="card-header login-header text-center py-3 border-0">
          <h1 class="h5 mb-0 text-white">Calendario eventos</h1>
          <p class="small mb-0 text-white-50">Iniciar sesión</p>
        </div>
        <div class="card-body p-4">
          <form id="loginForm">
            <div class="mb-3">
              <label for="loginNombre" class="form-label">Nombre de empleado</label>
              <input type="text" class="form-control form-control-sm" id="loginNombre" autocomplete="username" required>
            </div>
            <div class="mb-3">
              <label for="loginClave" class="form-label">Clave</label>
              <input type="password" class="form-control form-control-sm" id="loginClave" autocomplete="current-password" required>
            </div>
            <button type="submit" class="btn btn-primary btn-sm w-100">Ingresar</button>
          </form>
        </div>
      </div>
    </div>
  `;

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('loginNombre').value.trim();
    const clave = document.getElementById('loginClave').value;

    try {
      const session = await api.login(nombre, clave);
      setSession(session.token, session.empleado);
      toastSuccess(`Bienvenido, ${session.empleado.nombre}`);
      navigate(getDefaultRoute());
    } catch (err) {
      await showError(err.message);
    }
  });
}
