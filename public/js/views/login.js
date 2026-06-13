import * as api from '../api.js';
import { setSession, getDefaultRoute } from '../auth.js';
import { navigate } from '../router.js';
import { showError, toastSuccess } from '../alerts.js';
import { renderThemeSelector, bindThemeSelector } from '../themes.js';

function isLoginAnimatedDevice() {
  return window.matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)').matches;
}

export async function renderLogin(root) {
  const loginPageClass = isLoginAnimatedDevice()
    ? 'login-page min-vh-100'
    : 'login-page login-page--static-bg min-vh-100';

  root.innerHTML = `
    <div class="${loginPageClass}">
      <div class="login-bg" aria-hidden="true">
        <span class="login-bg-gradient"></span>
        <span class="login-bg-orb login-bg-orb-1"></span>
        <span class="login-bg-orb login-bg-orb-2"></span>
        <span class="login-bg-orb login-bg-orb-3"></span>
        <span class="login-bg-orb login-bg-orb-4"></span>
        <span class="login-bg-grid"></span>
      </div>

      <div class="login-top-bar">
        <img src="/favicon.png" alt="TICKETS SOPORTE" class="login-brand-logo">
        ${renderThemeSelector()}
      </div>

      <div class="login-wrapper d-flex align-items-center justify-content-center flex-grow-1 p-3">
        <div class="login-card w-100">
          <div class="login-card-header text-center">
            <h1 class="login-title mb-1">TICKETS SOPORTE</h1>
            <p class="login-subtitle mb-0">Iniciar sesión</p>
          </div>
          <div class="login-card-body">
            <form id="loginForm">
              <div class="mb-3">
                <label for="loginNombre" class="form-label login-label">Nombre de empleado</label>
                <div class="login-input-wrap">
                  <i class="fa-solid fa-user login-input-icon" aria-hidden="true"></i>
                  <input type="text" class="form-control login-input" id="loginNombre"
                    autocomplete="username" placeholder="Tu nombre" required>
                </div>
              </div>
              <div class="mb-4">
                <label for="loginClave" class="form-label login-label">Clave</label>
                <div class="login-input-wrap">
                  <i class="fa-solid fa-key login-input-icon" aria-hidden="true"></i>
                  <input type="password" class="form-control login-input" id="loginClave"
                    autocomplete="current-password" placeholder="••••••••" required>
                </div>
              </div>
              <button type="submit" class="btn btn-primary login-submit-btn w-100">
                <i class="fa-solid fa-right-to-bracket me-2"></i>Ingresar
              </button>
            </form>
          </div>
        </div>
      </div>

      <div class="login-build-label" id="loginBuildLabel">Modificación #—</div>
    </div>
  `;

  bindThemeSelector();

  try {
    const { build } = await api.getBuildCounter();
    document.getElementById('loginBuildLabel').textContent = `Modificación #${build}`;
  } catch {
    document.getElementById('loginBuildLabel').textContent = 'Modificación #0';
  }

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
