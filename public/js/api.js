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



export function getBuildCounter() {

  return fetch('/build-counter.json', { cache: 'no-store' })

    .then((res) => (res.ok ? res.json() : { build: 0 }))

    .catch(() => ({ build: 0 }));

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



export function getDashboardResumen(start, end) {

  return post('/dashboard/resumen', { start, end });

}



export function listTicketsCalendar(start, end) {

  return post('/tickets/calendar', { start, end });

}



export function assignTicketEmpleado(id, codigo_empleado) {
  return post('/tickets/asignar', { id, codigo_empleado });
}

export function listTicketsArchivo(start, end) {
  return post('/tickets/archivo', { start, end });
}

export function listTickets() {

  return post('/tickets/list');

}



export function getTicket(id) {

  return post('/tickets/get', { id });

}



export function createTicket(body) {

  return post('/tickets/create', body);

}



export function updateTicket(body) {

  return post('/tickets/update', body);

}



export function finalizarTicket(id, body = {}) {

  return post('/tickets/finalizar', { id, ...body });

}



export function deleteTicket(id) {

  return post('/tickets/delete', { id });

}

export function deleteTicketPhotosInRange(start, end) {
  return post('/tickets/delete-fotos', { start, end });
}


