const TOKEN_KEY = 'calendario_auth_token';
const SESSION_KEY = 'calendario_auth_session';

let memoryToken = null;
let memorySession = null;

export function getToken() {
  return memoryToken;
}

export function getSession() {
  return memorySession;
}

export function getEmpleado() {
  return getSession()?.empleado || null;
}

export function isSupervisor() {
  return getEmpleado()?.tipo === 'SUPERVISOR';
}

export function isSuperUser() {
  return Boolean(getEmpleado()?.es_superusuario);
}

export function getEmpnit() {
  return getEmpleado()?.empnit || null;
}

export function getEmpresaNombre() {
  return getEmpleado()?.empresa_nombre || getEmpnit() || '';
}

export function updateSessionEmpresa({ empnit, empresa_nombre }) {
  const session = getSession();
  if (!session) return;
  setSession(session.token, {
    ...session.empleado,
    empnit,
    empresa_nombre: empresa_nombre || empnit,
  });
}

export function isTecnico() {
  return getEmpleado()?.tipo === 'TECNICO';
}

export function setSession(token, empleado) {
  memoryToken = token;
  memorySession = { token, empleado };
}

export function clearSession() {
  memoryToken = null;
  memorySession = null;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken() && getEmpleado());
}

export function getDefaultRoute() {
  return isSupervisor() ? 'inicio' : 'tickets';
}

export function canAccessRoute(path) {
  if (path === 'login') return true;
  if (!isAuthenticated()) return false;
  if (isSuperUser()) {
    return [
      'inicio',
      'tickets',
      'calendario',
      'facturacion',
      'archivo',
      'empleados',
      'clientes',
      'config',
      'empresas',
    ].includes(path);
  }
  if (path === 'empresas') return false;
  if (path === 'facturacion') return isSupervisor();
  if (isSupervisor()) {
    return ['inicio', 'tickets', 'calendario', 'facturacion', 'archivo', 'empleados', 'clientes', 'config'].includes(path);
  }
  return ['calendario', 'tickets'].includes(path);
}
