const express = require('express');
const db = require('../db');
const { login, logout, requireAuth, requireSupervisor } = require('../auth');
const { validateEmpleado, validateCliente, validateEvento, validateCotizacion } = require('../validators');

const router = express.Router();

const EVENTO_SELECT = `
  SELECT e.id, e.titulo, e.descripcion, e.observaciones, e.inicio, e.fin, e.estatus,
         e.totalprecio, e.cotizado, e.empleado_codigo, e.cliente_codigo,
         emp.nombre AS empleado_nombre, emp.color AS empleado_color,
         c.nombre_empresa AS cliente_empresa, c.nombre_cliente AS cliente_nombre
  FROM eventos e
  JOIN empleados emp ON emp.codigo = e.empleado_codigo
  LEFT JOIN clientes c ON c.codigo = e.cliente_codigo
`;

function mapEventoRow(row) {
  return {
    id: row.id,
    titulo: row.titulo,
    descripcion: row.descripcion,
    observaciones: row.observaciones,
    inicio: row.inicio,
    fin: row.fin,
    estatus: row.estatus || 'pendiente',
    totalprecio: row.totalprecio,
    cotizado: row.cotizado,
    empleado_codigo: row.empleado_codigo,
    empleado_nombre: row.empleado_nombre,
    empleado_color: row.empleado_color || '#7c3aed',
    cliente_codigo: row.cliente_codigo,
    cliente_empresa: row.cliente_empresa,
    cliente_nombre: row.cliente_nombre,
  };
}

function mapEmpleadoRow(row, includeClave = false) {
  const data = {
    codigo: row.codigo,
    nombre: row.nombre,
    telefono: row.telefono,
    tipo: row.tipo,
    estado: row.estado,
    color: row.color || '#7c3aed',
  };
  if (includeClave) data.clave = row.clave;
  return data;
}

function empleadoExists(codigo) {
  return Boolean(db.prepare('SELECT codigo FROM empleados WHERE codigo = ?').get(codigo));
}

function clienteExists(codigo) {
  return Boolean(db.prepare('SELECT codigo FROM clientes WHERE codigo = ?').get(codigo));
}

function filterEventosForAuth(rows, auth) {
  if (auth.tipo === 'TECNICO') {
    return rows.filter((r) => r.empleado_codigo === auth.empleado_codigo);
  }
  return rows;
}

function canAccessEvento(evento, auth) {
  if (auth.tipo === 'SUPERVISOR') return true;
  return evento.empleado_codigo === auth.empleado_codigo;
}

router.post('/auth/login', (req, res) => {
  const { nombre, clave } = req.body || {};
  const session = login(nombre, clave);
  if (!session) {
    return res.status(401).json({ error: 'Nombre o clave incorrectos.' });
  }
  res.json(session);
});

router.post('/auth/logout', requireAuth, (req, res) => {
  logout(req.auth.token);
  res.json({ ok: true });
});

router.use(requireAuth);

router.post('/empleados/list', (req, res) => {
  const onlyActivos = req.body?.soloActivos === true;
  const sql = onlyActivos
    ? `SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados
       WHERE estado = 'ACTIVO' ORDER BY nombre COLLATE NOCASE`
    : `SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados
       ORDER BY nombre COLLATE NOCASE`;
  res.json(db.prepare(sql).all());
});

router.post('/empleados/get', requireSupervisor, (req, res) => {
  const codigo = Number(req.body?.codigo);
  const row = db
    .prepare('SELECT codigo, nombre, telefono, tipo, estado, clave, color FROM empleados WHERE codigo = ?')
    .get(codigo);
  if (!row) return res.status(404).json({ error: 'Empleado no encontrado.' });
  res.json(mapEmpleadoRow(row, true));
});

router.post('/empleados/create', requireSupervisor, (req, res) => {
  const result = validateEmpleado(req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

  const info = db
    .prepare(
      'INSERT INTO empleados (nombre, telefono, tipo, estado, clave, color) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      result.data.nombre,
      result.data.telefono,
      result.data.tipo,
      result.data.estado,
      result.data.clave,
      result.data.color
    );

  const row = db
    .prepare('SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados WHERE codigo = ?')
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.post('/empleados/update', requireSupervisor, (req, res) => {
  const codigo = Number(req.body?.codigo);
  const existing = db
    .prepare('SELECT codigo, clave FROM empleados WHERE codigo = ?')
    .get(codigo);
  if (!existing) return res.status(404).json({ error: 'Empleado no encontrado.' });

  const merged = {
    ...req.body,
    clave:
      req.body.clave !== undefined && String(req.body.clave).length > 0
        ? req.body.clave
        : existing.clave,
  };

  const result = validateEmpleado(merged);
  if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

  db.prepare(
    'UPDATE empleados SET nombre = ?, telefono = ?, tipo = ?, estado = ?, clave = ?, color = ? WHERE codigo = ?'
  ).run(
    result.data.nombre,
    result.data.telefono,
    result.data.tipo,
    result.data.estado,
    result.data.clave,
    result.data.color,
    codigo
  );

  const row = db
    .prepare('SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados WHERE codigo = ?')
    .get(codigo);
  res.json(row);
});

router.post('/empleados/delete', requireSupervisor, (req, res) => {
  const codigo = Number(req.body?.codigo);
  const existing = db.prepare('SELECT codigo FROM empleados WHERE codigo = ?').get(codigo);
  if (!existing) return res.status(404).json({ error: 'Empleado no encontrado.' });

  const eventCount = db
    .prepare('SELECT COUNT(*) AS total FROM eventos WHERE empleado_codigo = ?')
    .get(codigo);
  if (eventCount.total > 0) {
    return res.status(409).json({
      error: 'No se puede eliminar el empleado porque tiene eventos asociados.',
    });
  }

  db.prepare('DELETE FROM empleados WHERE codigo = ?').run(codigo);
  res.json({ ok: true });
});

router.post('/clientes/list', requireSupervisor, (req, res) => {
  const rows = db
    .prepare(
      `SELECT codigo, nombre_empresa, nombre_cliente, direccion, latitud, longitud
       FROM clientes ORDER BY nombre_empresa COLLATE NOCASE, nombre_cliente COLLATE NOCASE`
    )
    .all();
  res.json(rows);
});

router.post('/clientes/get', requireSupervisor, (req, res) => {
  const codigo = Number(req.body?.codigo);
  const row = db
    .prepare(
      `SELECT codigo, nombre_empresa, nombre_cliente, direccion, latitud, longitud
       FROM clientes WHERE codigo = ?`
    )
    .get(codigo);
  if (!row) return res.status(404).json({ error: 'Cliente no encontrado.' });
  res.json(row);
});

router.post('/clientes/create', requireSupervisor, (req, res) => {
  const result = validateCliente(req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

  const info = db
    .prepare(
      `INSERT INTO clientes (nombre_empresa, nombre_cliente, direccion, latitud, longitud)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      result.data.nombre_empresa,
      result.data.nombre_cliente,
      result.data.direccion,
      result.data.latitud,
      result.data.longitud
    );

  const row = db
    .prepare(
      `SELECT codigo, nombre_empresa, nombre_cliente, direccion, latitud, longitud
       FROM clientes WHERE codigo = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.post('/clientes/update', requireSupervisor, (req, res) => {
  const codigo = Number(req.body?.codigo);
  const existing = db.prepare('SELECT codigo FROM clientes WHERE codigo = ?').get(codigo);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const result = validateCliente(req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

  db.prepare(
    `UPDATE clientes SET nombre_empresa = ?, nombre_cliente = ?, direccion = ?, latitud = ?, longitud = ?
     WHERE codigo = ?`
  ).run(
    result.data.nombre_empresa,
    result.data.nombre_cliente,
    result.data.direccion,
    result.data.latitud,
    result.data.longitud,
    codigo
  );

  const row = db
    .prepare(
      `SELECT codigo, nombre_empresa, nombre_cliente, direccion, latitud, longitud
       FROM clientes WHERE codigo = ?`
    )
    .get(codigo);
  res.json(row);
});

router.post('/clientes/delete', requireSupervisor, (req, res) => {
  const codigo = Number(req.body?.codigo);
  const existing = db.prepare('SELECT codigo FROM clientes WHERE codigo = ?').get(codigo);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });

  const eventCount = db
    .prepare('SELECT COUNT(*) AS total FROM eventos WHERE cliente_codigo = ?')
    .get(codigo);
  if (eventCount.total > 0) {
    return res.status(409).json({
      error: 'No se puede eliminar el cliente porque tiene eventos asociados.',
    });
  }

  db.prepare('DELETE FROM clientes WHERE codigo = ?').run(codigo);
  res.json({ ok: true });
});

router.post('/dashboard/resumen', requireSupervisor, (req, res) => {
  const { start, end } = req.body || {};
  if (!start || !end) {
    return res.status(400).json({ error: 'Los parámetros start y end son obligatorios.' });
  }

  const eventos = db
    .prepare(`${EVENTO_SELECT} WHERE e.inicio < ? AND e.fin > ? ORDER BY e.inicio`)
    .all(end, start)
    .map(mapEventoRow);

  const empleados = db
    .prepare(
      `SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados
       WHERE estado = 'ACTIVO' ORDER BY nombre COLLATE NOCASE`
    )
    .all();

  const pendientesPorEmpleado = db
    .prepare(
      `SELECT empleado_codigo, COUNT(*) AS pendientes FROM eventos
       WHERE estatus = 'pendiente' AND inicio < ? AND fin > ?
       GROUP BY empleado_codigo`
    )
    .all(end, start);

  const pendientesMap = Object.fromEntries(
    pendientesPorEmpleado.map((r) => [r.empleado_codigo, r.pendientes])
  );

  res.json({
    eventos,
    empleados: empleados.map((e) => ({
      ...e,
      pendientes: pendientesMap[e.codigo] || 0,
    })),
  });
});

router.post('/eventos/list', (req, res) => {
  const { start, end } = req.body || {};
  if (!start || !end) {
    return res.status(400).json({ error: 'Los parámetros start y end son obligatorios.' });
  }

  const rows = db
    .prepare(`${EVENTO_SELECT} WHERE e.inicio < ? AND e.fin > ? ORDER BY e.inicio`)
    .all(end, start)
    .map(mapEventoRow);

  res.json(filterEventosForAuth(rows, req.auth));
});

router.post('/eventos/get', (req, res) => {
  const id = Number(req.body?.id);
  const row = db.prepare(`${EVENTO_SELECT} WHERE e.id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Evento no encontrado.' });
  const evento = mapEventoRow(row);
  if (!canAccessEvento(evento, req.auth)) {
    return res.status(403).json({ error: 'No autorizado.' });
  }
  res.json(evento);
});

router.post('/eventos/create', requireSupervisor, (req, res) => {
  const result = validateEvento(req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

  if (!empleadoExists(result.data.empleado_codigo)) {
    return res.status(400).json({ error: 'El empleado seleccionado no existe.' });
  }
  if (!clienteExists(result.data.cliente_codigo)) {
    return res.status(400).json({ error: 'El cliente seleccionado no existe.' });
  }

  const info = db
    .prepare(
      `INSERT INTO eventos (titulo, descripcion, observaciones, inicio, fin, empleado_codigo,
       cliente_codigo, estatus, totalprecio, cotizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      result.data.titulo,
      result.data.descripcion,
      result.data.observaciones,
      result.data.inicio,
      result.data.fin,
      result.data.empleado_codigo,
      result.data.cliente_codigo,
      result.data.estatus || 'pendiente',
      result.data.totalprecio,
      result.data.cotizado
    );

  const row = db.prepare(`${EVENTO_SELECT} WHERE e.id = ?`).get(info.lastInsertRowid);
  res.status(201).json(mapEventoRow(row));
});

router.post('/eventos/update', requireSupervisor, (req, res) => {
  const id = Number(req.body?.id);
  const existing = db.prepare('SELECT id FROM eventos WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Evento no encontrado.' });

  const current = db
    .prepare(
      `SELECT titulo, descripcion, observaciones, inicio, fin, empleado_codigo, cliente_codigo,
              estatus, totalprecio, cotizado FROM eventos WHERE id = ?`
    )
    .get(id);

  const merged = {
    titulo: req.body.titulo !== undefined ? req.body.titulo : current.titulo,
    descripcion: req.body.descripcion !== undefined ? req.body.descripcion : current.descripcion,
    observaciones:
      req.body.observaciones !== undefined ? req.body.observaciones : current.observaciones,
    inicio: req.body.inicio !== undefined ? req.body.inicio : current.inicio,
    fin: req.body.fin !== undefined ? req.body.fin : current.fin,
    empleado_codigo:
      req.body.empleado_codigo !== undefined ? req.body.empleado_codigo : current.empleado_codigo,
    cliente_codigo:
      req.body.cliente_codigo !== undefined ? req.body.cliente_codigo : current.cliente_codigo,
    estatus: req.body.estatus !== undefined ? req.body.estatus : current.estatus,
    totalprecio: req.body.totalprecio !== undefined ? req.body.totalprecio : current.totalprecio,
    cotizado: req.body.cotizado !== undefined ? req.body.cotizado : current.cotizado,
  };

  const requireTotalPrecio = merged.estatus === 'realizado';
  const result = validateEvento(merged, false, { requireTotalPrecio });
  if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

  db.prepare(
    `UPDATE eventos SET titulo = ?, descripcion = ?, observaciones = ?, inicio = ?, fin = ?,
     empleado_codigo = ?, cliente_codigo = ?, estatus = ?, totalprecio = ?, cotizado = ?
     WHERE id = ?`
  ).run(
    result.data.titulo,
    result.data.descripcion,
    result.data.observaciones,
    result.data.inicio,
    result.data.fin,
    result.data.empleado_codigo,
    result.data.cliente_codigo,
    result.data.estatus,
    result.data.totalprecio,
    result.data.cotizado,
    id
  );

  const row = db.prepare(`${EVENTO_SELECT} WHERE e.id = ?`).get(id);
  res.json(mapEventoRow(row));
});

router.post('/eventos/completar', (req, res) => {
  const id = Number(req.body?.id);
  const row = db.prepare(`${EVENTO_SELECT} WHERE e.id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Evento no encontrado.' });

  const evento = mapEventoRow(row);
  if (!canAccessEvento(evento, req.auth)) {
    return res.status(403).json({ error: 'No autorizado.' });
  }

  const result = validateEvento(
    {
      ...evento,
      estatus: 'realizado',
      totalprecio: req.body.totalprecio,
    },
    false,
    { requireTotalPrecio: true }
  );
  if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

  db.prepare(`UPDATE eventos SET estatus = 'realizado', totalprecio = ? WHERE id = ?`).run(
    result.data.totalprecio,
    id
  );

  const updated = db.prepare(`${EVENTO_SELECT} WHERE e.id = ?`).get(id);
  res.json(mapEventoRow(updated));
});

router.post('/eventos/delete', requireSupervisor, (req, res) => {
  const id = Number(req.body?.id);
  const existing = db.prepare('SELECT id FROM eventos WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Evento no encontrado.' });

  db.prepare('DELETE FROM eventos WHERE id = ?').run(id);
  res.json({ ok: true });
});

const COTIZACION_SELECT = `
  SELECT id, fecha, cliente, telefono, vence, totalprecio, detalles, status
  FROM cotizaciones
`;

function mapCotizacionRow(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    cliente: row.cliente,
    telefono: row.telefono,
    vence: row.vence,
    totalprecio: row.totalprecio,
    detalles: row.detalles,
    status: row.status || 'PENDIENTE',
  };
}

router.post('/cotizaciones/list', requireSupervisor, (req, res) => {
  const { start, end } = req.body || {};
  if (!start || !end) {
    return res.status(400).json({ error: 'Los parámetros start y end son obligatorios.' });
  }
  const rows = db
    .prepare(`${COTIZACION_SELECT} WHERE fecha >= ? AND fecha <= ? ORDER BY fecha DESC, id DESC`)
    .all(start.slice(0, 10), end.slice(0, 10))
    .map(mapCotizacionRow);
  res.json(rows);
});

router.post('/cotizaciones/get', requireSupervisor, (req, res) => {
  const id = Number(req.body?.id);
  const row = db.prepare(`${COTIZACION_SELECT} WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Cotización no encontrada.' });
  res.json(mapCotizacionRow(row));
});

router.post('/cotizaciones/create', requireSupervisor, (req, res) => {
  const result = validateCotizacion(req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

  const info = db
    .prepare(
      `INSERT INTO cotizaciones (fecha, cliente, telefono, vence, totalprecio, detalles, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      result.data.fecha,
      result.data.cliente,
      result.data.telefono,
      result.data.vence,
      result.data.totalprecio,
      result.data.detalles,
      result.data.status
    );

  const row = db.prepare(`${COTIZACION_SELECT} WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(mapCotizacionRow(row));
});

router.post('/cotizaciones/update', requireSupervisor, (req, res) => {
  const id = Number(req.body?.id);
  const existing = db.prepare('SELECT id FROM cotizaciones WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Cotización no encontrada.' });

  const current = db
    .prepare(
      `SELECT fecha, cliente, telefono, vence, totalprecio, detalles, status
       FROM cotizaciones WHERE id = ?`
    )
    .get(id);

  const merged = {
    fecha: req.body.fecha !== undefined ? req.body.fecha : current.fecha,
    cliente: req.body.cliente !== undefined ? req.body.cliente : current.cliente,
    telefono: req.body.telefono !== undefined ? req.body.telefono : current.telefono,
    vence: req.body.vence !== undefined ? req.body.vence : current.vence,
    totalprecio: req.body.totalprecio !== undefined ? req.body.totalprecio : current.totalprecio,
    detalles: req.body.detalles !== undefined ? req.body.detalles : current.detalles,
    status: req.body.status !== undefined ? req.body.status : current.status,
  };

  const result = validateCotizacion(merged);
  if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

  db.prepare(
    `UPDATE cotizaciones SET fecha = ?, cliente = ?, telefono = ?, vence = ?, totalprecio = ?,
     detalles = ?, status = ? WHERE id = ?`
  ).run(
    result.data.fecha,
    result.data.cliente,
    result.data.telefono,
    result.data.vence,
    result.data.totalprecio,
    result.data.detalles,
    result.data.status,
    id
  );

  const row = db.prepare(`${COTIZACION_SELECT} WHERE id = ?`).get(id);
  res.json(mapCotizacionRow(row));
});

router.post('/cotizaciones/delete', requireSupervisor, (req, res) => {
  const id = Number(req.body?.id);
  const existing = db.prepare('SELECT id FROM cotizaciones WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Cotización no encontrada.' });

  db.prepare('DELETE FROM cotizaciones WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
