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
  if (isSupervisor()) {
    return ['inicio', 'tickets', 'calendario', 'archivo', 'empleados', 'clientes', 'config'].includes(path);
  }
  return ['calendario', 'tickets'].includes(path);
}
