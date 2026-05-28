const crypto = require('crypto');
const { queryOne } = require('./db');

const sessions = new Map();

function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function findEmpleadoByNombre(nombre) {
  return queryOne(
    `SELECT codigo, nombre, telefono, tipo, estado, clave, color
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
  const token = createToken();
  const session = {
    token,
    empleado_codigo: empleado.codigo,
    nombre: empleado.nombre,
    tipo: empleado.tipo,
    estado: empleado.estado,
    color: empleado.color,
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
    },
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

module.exports = {
  login,
  logout,
  requireAuth,
  requireSupervisor,
  isSupervisor,
  isValidToken,
};
