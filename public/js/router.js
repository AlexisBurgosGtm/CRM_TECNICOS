import { isAuthenticated, canAccessRoute, getDefaultRoute } from './auth.js';
import { renderLogin } from './views/login.js';
import { renderHome } from './views/home.js';
import { renderCalendar, destroyCalendar } from './views/calendar.js';
import { renderEmployees } from './views/employees.js';
import { renderClients } from './views/clients.js';
import { renderTickets } from './views/tickets.js';
import { renderArchivo } from './views/archivo.js';

const routes = {
  login: { render: renderLogin, auth: false },
  inicio: { render: renderHome, auth: true },
  tickets: { render: renderTickets, auth: true },
  calendario: { render: renderCalendar, auth: true },
  archivo: { render: renderArchivo, auth: true },
  empleados: { render: renderEmployees, auth: true },
  clientes: { render: renderClients, auth: true },
};

let currentRoute = null;

function removeFloatingActions() {
  document.getElementById('btnFabNuevoTicket')?.remove();
}

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

  if (currentRoute !== path) {
    removeFloatingActions();
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
