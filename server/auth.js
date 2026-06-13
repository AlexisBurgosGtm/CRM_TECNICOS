const crypto = require('crypto');
const { queryOne } = require('./db');
const { getFirstEmpresaEmpnit, getEmpresaLabel } = require('./tenant');

const SUPER_USER_NAME = 'ALEXIS BURGOS';
const sessions = new Map();

function isSuperUserName(nombre) {
  return String(nombre || '').trim().toUpperCase() === SUPER_USER_NAME;
}

function isSuperUserAuth(auth) {
  return Boolean(auth?.es_superusuario);
}

function getEmpnit(auth) {
  const empnit = String(auth?.empnit || '').trim();
  return empnit || null;
}

function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function findEmpleadoByNombre(nombre) {
  return queryOne(
    `SELECT codigo, nombre, telefono, tipo, estado, clave, color, EMPNIT
     FROM empleados
     WHERE UPPER(nombre) = UPPER(?) AND estado = 'ACTIVO'`,
    [String(nombre).trim()]
  );
}

async function login(nombre, clave) {
  const empleado = await findEmpleadoByNombre(nombre);
  if (!empleado || empleado.clave !== String(clave)) {
    return null;
  }

  const esSuperusuario = isSuperUserName(empleado.nombre);
  let empnit;

  if (esSuperusuario) {
    empnit = await getFirstEmpresaEmpnit();
  } else {
    empnit = String(empleado.EMPNIT || '').trim();
    if (!empnit) return null;
  }

  const empresaNombre = await getEmpresaLabel(empnit);
  const token = createToken();
  const session = {
    token,
    empleado_codigo: empleado.codigo,
    nombre: empleado.nombre,
    tipo: empleado.tipo,
    estado: empleado.estado,
    color: empleado.color,
    es_superusuario: esSuperusuario,
    empnit,
    empresa_nombre: empresaNombre,
    createdAt: Date.now(),
  };
  sessions.set(token, session);
  return {
    token,
    empleado: {
      codigo: empleado.codigo,
      nombre: empleado.nombre,
      tipo: empleado.tipo,
      estado: empleado.estado,
      color: empleado.color,
      es_superusuario: esSuperusuario,
      empnit,
      empresa_nombre: empresaNombre,
    },
  };
}

async function setSessionEmpresa(token, empnit) {
  const session = sessions.get(token);
  if (!session || !session.es_superusuario) return null;

  const row = await queryOne('SELECT EMPNIT, EMPRESA FROM empresas WHERE EMPNIT = ?', [empnit]);
  if (!row) return null;

  session.empnit = row.EMPNIT;
  session.empresa_nombre = row.EMPRESA || row.EMPNIT;
  sessions.set(token, session);

  return {
    empnit: session.empnit,
    empresa_nombre: session.empresa_nombre,
  };
}

function logout(token) {
  if (token) sessions.delete(token);
}

function isValidToken(token) {
  return Boolean(token && sessions.has(token));
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!isValidToken(token)) {
    return res.status(401).json({ error: 'Sesión no válida. Inicie sesión nuevamente.' });
  }
  req.auth = sessions.get(token);
  next();
}

function requireSupervisor(req, res, next) {
  if (req.auth.tipo !== 'SUPERVISOR') {
    return res.status(403).json({ error: 'Solo un supervisor puede realizar esta acción.' });
  }
  next();
}

function isSupervisor(auth) {
  return auth?.tipo === 'SUPERVISOR';
}

function requireSuperUser(req, res, next) {
  if (!isSuperUserAuth(req.auth)) {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  next();
}

module.exports = {
  login,
  logout,
  setSessionEmpresa,
  requireAuth,
  requireSupervisor,
  requireSuperUser,
  isSupervisor,
  isSuperUserAuth,
  isSuperUserName,
  getEmpnit,
  isValidToken,
  SUPER_USER_NAME,
};
