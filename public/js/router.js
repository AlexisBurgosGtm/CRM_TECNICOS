import { isAuthenticated, canAccessRoute, getDefaultRoute } from './auth.js';
import { renderLogin } from './views/login.js';
import { renderHome } from './views/home.js';
import { renderCalendar, destroyCalendar } from './views/calendar.js';
import { renderEmployees } from './views/employees.js';
import { renderClients } from './views/clients.js';
import { renderCotizaciones } from './views/cotizaciones.js';

const routes = {
  login: { render: renderLogin, auth: false },
  inicio: { render: renderHome, auth: true },
  calendario: { render: renderCalendar, auth: true },
  empleados: { render: renderEmployees, auth: true },
  clientes: { render: renderClients, auth: true },
  cotizaciones: { render: renderCotizaciones, auth: true },
};

let currentRoute = null;

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '') || '';
  return hash.split('?')[0] || 'login';
}

export function navigate(path) {
  window.location.hash = `#/${path}`;
}

export async function handleRoute() {
  const path = parseHash();
  const route = routes[path];

  if (!route) {
    navigate(isAuthenticated() ? getDefaultRoute() : 'login');
    return;
  }

  if (route.auth && !isAuthenticated()) {
    navigate('login');
    return;
  }

  if (!route.auth && isAuthenticated() && path === 'login') {
    navigate(getDefaultRoute());
    return;
  }

  if (route.auth && !canAccessRoute(path)) {
    navigate(getDefaultRoute());
    return;
  }

  if (currentRoute === 'calendario' && path !== 'calendario') {
    destroyCalendar();
  }

  currentRoute = path;
  const root = document.getElementById('root');
  root.innerHTML = '';
  await route.render(root);
}

export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}
