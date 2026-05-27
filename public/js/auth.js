const TOKEN_KEY = 'calendario_auth_token';
const SESSION_KEY = 'calendario_auth_session';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token, empleado }));
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken() && getEmpleado());
}

export function getDefaultRoute() {
  return isSupervisor() ? 'inicio' : 'calendario';
}

export function canAccessRoute(path) {
  if (path === 'login') return true;
  if (!isAuthenticated()) return false;
  if (isSupervisor()) return ['inicio', 'calendario', 'empleados', 'clientes', 'cotizaciones'].includes(path);
  return path === 'calendario';
}
