import { getToken, clearSession } from './auth.js';

const API_BASE = '/api';

async function post(path, body = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    clearSession();
    window.location.hash = '#/login';
    throw new Error(data.error || 'Sesión expirada.');
  }

  if (!response.ok) {
    throw new Error(data.error || 'Error en la solicitud.');
  }

  return data;
}

export function login(nombre, clave) {
  return post('/auth/login', { nombre, clave });
}

export function logout() {
  return post('/auth/logout', {});
}

export function listEmpleados(soloActivos = false) {
  return post('/empleados/list', { soloActivos });
}

export function getEmpleado(codigo) {
  return post('/empleados/get', { codigo });
}

export function createEmpleado(body) {
  return post('/empleados/create', body);
}

export function updateEmpleado(body) {
  return post('/empleados/update', body);
}

export function deleteEmpleado(codigo) {
  return post('/empleados/delete', { codigo });
}

export function listClientes() {
  return post('/clientes/list');
}

export function createCliente(body) {
  return post('/clientes/create', body);
}

export function updateCliente(body) {
  return post('/clientes/update', body);
}

export function deleteCliente(codigo) {
  return post('/clientes/delete', { codigo });
}

export function listEventos(start, end) {
  return post('/eventos/list', { start, end });
}

export function createEvento(body) {
  return post('/eventos/create', body);
}

export function updateEvento(body) {
  return post('/eventos/update', body);
}

export function completarEvento(id, totalprecio) {
  return post('/eventos/completar', { id, totalprecio });
}

export function deleteEvento(id) {
  return post('/eventos/delete', { id });
}

export function getDashboardResumen(start, end) {
  return post('/dashboard/resumen', { start, end });
}

export function listCotizaciones(start, end) {
  return post('/cotizaciones/list', { start, end });
}

export function getCotizacion(id) {
  return post('/cotizaciones/get', { id });
}

export function createCotizacion(body) {
  return post('/cotizaciones/create', body);
}

export function updateCotizacion(body) {
  return post('/cotizaciones/update', body);
}

export function deleteCotizacion(id) {
  return post('/cotizaciones/delete', { id });
}
