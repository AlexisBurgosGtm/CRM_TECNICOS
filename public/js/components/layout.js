import * as api from '../api.js';
import { clearSession, isSupervisor } from '../auth.js';
import { navigate } from '../router.js';
import { confirmAction, toastSuccess } from '../alerts.js';

const ALL_PAGES = [
  { id: 'inicio', label: 'Inicio', path: 'inicio', icon: 'fa-house', supervisorOnly: true },
  { id: 'tickets', label: 'Tickets', path: 'tickets', icon: 'fa-ticket', supervisorOnly: false },
  { id: 'calendario', label: 'Eventos', path: 'calendario', icon: 'fa-calendar-days', supervisorOnly: false },
  { id: 'archivo', label: 'Archivo', path: 'archivo', icon: 'fa-box-archive', supervisorOnly: true },
  { id: 'empleados', label: 'Empleados', path: 'empleados', icon: 'fa-user-group', supervisorOnly: true },
  { id: 'clientes', label: 'Clientes', path: 'clientes', icon: 'fa-building', supervisorOnly: true },
  { id: 'config', label: 'Config', path: 'config', icon: 'fa-gear', supervisorOnly: true },
];

let shellMounted = false;

export function renderLogoutButton() {
  return `<button type="button" class="btn btn-outline-light btn-sm" id="btnLogout"><i class="fa-solid fa-right-from-bracket me-1"></i>Salir</button>`;
}

export async function bindLogout() {
  const btn = document.getElementById('btnLogout');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async () => {
    const ok = await confirmAction('Cerrar sesión', '¿Desea salir de la aplicación?');
    if (!ok) return;
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    clearSession();
    toastSuccess('Sesión cerrada');
    navigate('login');
  });
}

function buildNavLinks(activePage) {
  const pages = isSupervisor() ? ALL_PAGES : ALL_PAGES.filter((p) => !p.supervisorOnly);
  return pages
    .map(
      (p) => `
      <a class="nav-link rounded-0 px-3 py-2 d-flex align-items-center ${activePage === p.id ? 'active' : ''}"
         href="#/${p.path}" data-nav-page="${p.id}">
        <i class="fa-solid ${p.icon} me-2 nav-icon"></i>${p.label}
      </a>`
    )
    .join('');
}

function mountAppShell() {
  if (shellMounted) return;

  const shell = document.createElement('div');
  shell.id = 'appShell';
  shell.innerHTML = `
    <nav class="navbar navbar-app small sticky-top shadow-sm">
      <div class="container-fluid">
        <button class="btn btn-outline-light btn-sm d-inline-flex align-items-center justify-content-center menu-hamburger"
          type="button" data-bs-toggle="offcanvas" data-bs-target="#sidebarMenu" aria-label="Abrir menú">
          <i class="fa-solid fa-bars"></i>
        </button>
        <span class="navbar-brand mb-0 h6 ms-2" id="appShellTitle"></span>
        <div class="ms-auto d-flex align-items-center gap-2">
          <span id="appShellExtra"></span>
          ${renderLogoutButton()}
        </div>
      </div>
    </nav>
    <div class="offcanvas offcanvas-start small sidebar-offcanvas" tabindex="-1" id="sidebarMenu"
      data-bs-scroll="false" data-bs-backdrop="true">
      <div class="offcanvas-header offcanvas-header-app border-bottom py-2">
        <h6 class="offcanvas-title mb-0"><i class="fa-solid fa-calendar-check me-2"></i>TECNOSYSTEM</h6>
        <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
      </div>
      <div class="offcanvas-body p-0">
        <nav class="nav flex-column nav-pills sidebar-nav" id="sidebarNav"></nav>
      </div>
    </div>
  `;

  const root = document.getElementById('root');
  document.body.insertBefore(shell, root);

  document.getElementById('sidebarNav').addEventListener('click', (e) => {
    if (e.target.closest('.nav-link')) closeSidebar();
  });

  shellMounted = true;
}

export function closeSidebar() {
  const el = document.getElementById('sidebarMenu');
  if (!el) return;

  const instance = bootstrap.Offcanvas.getInstance(el);
  if (instance) {
    instance.hide();
    return;
  }

  if (el.classList.contains('show')) {
    el.classList.remove('show');
    el.removeAttribute('aria-modal');
    el.removeAttribute('role');
    el.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('.offcanvas-backdrop').forEach((backdrop) => backdrop.remove());
    document.body.classList.remove('overflow-hidden', 'offcanvas-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
  }
}

export function showAppShell() {
  document.getElementById('appShell')?.classList.remove('d-none');
}

export function hideAppShell() {
  closeSidebar();
  document.getElementById('appShell')?.classList.add('d-none');
}

export function updateAppShell(activePage, pageTitle, extraHeaderHtml = '') {
  mountAppShell();
  showAppShell();
  document.getElementById('appShellTitle').textContent = pageTitle;
  document.getElementById('appShellExtra').innerHTML = extraHeaderHtml;
  document.getElementById('sidebarNav').innerHTML = buildNavLinks(activePage);
}

/** @deprecated Use updateAppShell() — shell is persistent and not rendered inside views. */
export function renderAppShell(activePage, pageTitle, extraHeaderHtml = '') {
  updateAppShell(activePage, pageTitle, extraHeaderHtml);
  return '';
}
