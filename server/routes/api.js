const express = require('express');
const { query, queryOne, execute, toDateString } = require('../db');
const { login, logout, requireAuth, requireSupervisor } = require('../auth');
const {
  validateEmpleado,
  validateCliente,
  validateTicket,
  parseDateOnly,
  sanitizeMysqlText,
} = require('../validators');
const { deletePhotoFile } = require('../photos');
const { loadTicketPhotos, saveTicketPhotos } = require('../ticket-photos');

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
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

async function empleadoExists(codigo) {
  const row = await queryOne('SELECT codigo FROM empleados WHERE codigo = ?', [codigo]);
  return Boolean(row);
}

async function clienteExists(codigo) {
  const row = await queryOne('SELECT codigo FROM clientes WHERE codigo = ?', [codigo]);
  return Boolean(row);
}

function filterTicketsForAuth(rows, auth) {
  if (auth.tipo === 'TECNICO') {
    return rows.filter((r) => r.codigo_empleado === auth.empleado_codigo);
  }
  return rows;
}

function canAccessTicket(ticket, auth) {
  if (auth.tipo === 'SUPERVISOR') return true;
  if (!ticket.codigo_empleado) return false;
  return ticket.codigo_empleado === auth.empleado_codigo;
}

function mapTicketToCalendarEvent(row) {
  const fechaFin = toDateString(row.fecha_fin) || toDateString(row.fecha_inicio);
  return {
    id: row.id,
    empleado_codigo: row.codigo_empleado,
    empleado_nombre: row.empleado_nombre || 'Sin asignar',
    empleado_color: row.empleado_color || '#7c3aed',
    estatus: row.status === 'FINALIZADO' ? 'realizado' : 'pendiente',
    inicio: toDateString(row.fecha_inicio),
    fin: fechaFin,
    cliente_empresa: row.cliente_empresa,
    cliente_nombre: row.cliente_nombre,
    cliente_telefono: row.cliente_telefono,
    reporte_cliente: row.reporte_cliente,
    accesos: row.accesos,
    notas: row.notas,
  };
}

router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const { nombre, clave } = req.body || {};
    const session = await login(nombre, clave);
    if (!session) {
      return res.status(401).json({ error: 'Nombre o clave incorrectos.' });
    }
    res.json(session);
  })
);

router.post('/auth/logout', requireAuth, (req, res) => {
  logout(req.auth.token);
  res.json({ ok: true });
});

router.use(requireAuth);

router.post(
  '/empleados/list',
  asyncHandler(async (req, res) => {
    const onlyActivos = req.body?.soloActivos === true;
    const sql = onlyActivos
      ? `SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados
         WHERE estado = 'ACTIVO' ORDER BY nombre`
      : `SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados ORDER BY nombre`;
    res.json(await query(sql));
  })
);

router.post(
  '/empleados/get',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const codigo = Number(req.body?.codigo);
    const row = await queryOne(
      'SELECT codigo, nombre, telefono, tipo, estado, clave, color FROM empleados WHERE codigo = ?',
      [codigo]
    );
    if (!row) return res.status(404).json({ error: 'Empleado no encontrado.' });
    res.json(mapEmpleadoRow(row, true));
  })
);

router.post(
  '/empleados/create',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const result = validateEmpleado(req.body);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

    const info = await execute(
      'INSERT INTO empleados (nombre, telefono, tipo, estado, clave, color) VALUES (?, ?, ?, ?, ?, ?)',
      [
        result.data.nombre,
        result.data.telefono,
        result.data.tipo,
        result.data.estado,
        result.data.clave,
        result.data.color,
      ]
    );

    const row = await queryOne(
      'SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados WHERE codigo = ?',
      [info.insertId]
    );
    res.status(201).json(row);
  })
);

router.post(
  '/empleados/update',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const codigo = Number(req.body?.codigo);
    const existing = await queryOne('SELECT codigo, clave FROM empleados WHERE codigo = ?', [codigo]);
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

    await execute(
      'UPDATE empleados SET nombre = ?, telefono = ?, tipo = ?, estado = ?, clave = ?, color = ? WHERE codigo = ?',
      [
        result.data.nombre,
        result.data.telefono,
        result.data.tipo,
        result.data.estado,
        result.data.clave,
        result.data.color,
        codigo,
      ]
    );

    const row = await queryOne(
      'SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados WHERE codigo = ?',
      [codigo]
    );
    res.json(row);
  })
);

router.post(
  '/empleados/delete',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const codigo = Number(req.body?.codigo);
    const existing = await queryOne('SELECT codigo FROM empleados WHERE codigo = ?', [codigo]);
    if (!existing) return res.status(404).json({ error: 'Empleado no encontrado.' });

    const ticketCount = await queryOne(
      'SELECT COUNT(*) AS total FROM tickets WHERE codigo_empleado = ?',
      [codigo]
    );
    if (Number(ticketCount.total) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar el empleado porque tiene tickets asociados.',
      });
    }

    await execute('DELETE FROM empleados WHERE codigo = ?', [codigo]);
    res.json({ ok: true });
  })
);

router.post(
  '/clientes/list',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT codigo, nombre_empresa, nombre_cliente, telefono, direccion, latitud, longitud
       FROM clientes ORDER BY nombre_empresa, nombre_cliente`
    );
    res.json(rows);
  })
);

router.post(
  '/clientes/get',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const codigo = Number(req.body?.codigo);
    const row = await queryOne(
      `SELECT codigo, nombre_empresa, nombre_cliente, telefono, direccion, latitud, longitud
       FROM clientes WHERE codigo = ?`,
      [codigo]
    );
    if (!row) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json(row);
  })
);

router.post(
  '/clientes/create',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const result = validateCliente(req.body);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

    const info = await execute(
      `INSERT INTO clientes (nombre_empresa, nombre_cliente, telefono, direccion, latitud, longitud)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        result.data.nombre_empresa,
        result.data.nombre_cliente,
        result.data.telefono,
        result.data.direccion,
        result.data.latitud,
        result.data.longitud,
      ]
    );

    const row = await queryOne(
      `SELECT codigo, nombre_empresa, nombre_cliente, telefono, direccion, latitud, longitud
       FROM clientes WHERE codigo = ?`,
      [info.insertId]
    );
    res.status(201).json(row);
  })
);

router.post(
  '/clientes/update',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const codigo = Number(req.body?.codigo);
    const existing = await queryOne('SELECT codigo FROM clientes WHERE codigo = ?', [codigo]);
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const result = validateCliente(req.body);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

    await execute(
      `UPDATE clientes SET nombre_empresa = ?, nombre_cliente = ?, telefono = ?, direccion = ?, latitud = ?, longitud = ?
       WHERE codigo = ?`,
      [
        result.data.nombre_empresa,
        result.data.nombre_cliente,
        result.data.telefono,
        result.data.direccion,
        result.data.latitud,
        result.data.longitud,
        codigo,
      ]
    );

    const row = await queryOne(
      `SELECT codigo, nombre_empresa, nombre_cliente, telefono, direccion, latitud, longitud
       FROM clientes WHERE codigo = ?`,
      [codigo]
    );
    res.json(row);
  })
);

router.post(
  '/clientes/delete',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const codigo = Number(req.body?.codigo);
    const existing = await queryOne('SELECT codigo FROM clientes WHERE codigo = ?', [codigo]);
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const ticketCount = await queryOne(
      'SELECT COUNT(*) AS total FROM tickets WHERE codigo_cliente = ?',
      [codigo]
    );
    if (Number(ticketCount.total) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar el cliente porque tiene tickets asociados.',
      });
    }

    await execute('DELETE FROM clientes WHERE codigo = ?', [codigo]);
    res.json({ ok: true });
  })
);

router.post(
  '/dashboard/resumen',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const { start, end } = req.body || {};
    if (!start || !end) {
      return res.status(400).json({ error: 'Los parámetros start y end son obligatorios.' });
    }

    const startDate = String(start).slice(0, 10);
    const endDate = String(end).slice(0, 10);

    const ticketRows = await query(
      `${TICKET_LIST_SELECT}
       WHERE t.fecha_inicio < ? AND COALESCE(t.fecha_fin, t.fecha_inicio) >= ?
       ORDER BY t.fecha_inicio ASC, t.id ASC`,
      [endDate, startDate]
    );
    const tickets = await Promise.all(ticketRows.map((row) => mapTicketRow(row)));

    const empleados = await query(
      `SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados
       WHERE estado = 'ACTIVO' ORDER BY nombre`
    );

    const pendientesPorEmpleado = await query(
      `SELECT codigo_empleado, COUNT(*) AS pendientes FROM tickets
       WHERE status = 'PENDIENTE' AND fecha_inicio < ? AND COALESCE(fecha_fin, fecha_inicio) >= ?
       GROUP BY codigo_empleado`,
      [endDate, startDate]
    );

    const pendientesMap = Object.fromEntries(
      pendientesPorEmpleado.map((r) => [r.codigo_empleado, Number(r.pendientes)])
    );

    res.json({
      tickets,
      empleados: empleados.map((e) => ({
        ...e,
        pendientes: pendientesMap[e.codigo] || 0,
      })),
    });
  })
);


const TICKET_LIST_SELECT = `
  SELECT t.id, t.fecha_inicio, t.fecha_fin, t.codigo_empleado, t.codigo_cliente,
         t.reporte_cliente, t.reporte_tecnico, t.accesos, t.notas, t.totalprecio, t.status, t.prioridad,
         emp.nombre AS empleado_nombre,
         c.nombre_empresa AS cliente_empresa, c.nombre_cliente AS cliente_nombre,
         c.telefono AS cliente_telefono
  FROM tickets t
  LEFT JOIN empleados emp ON emp.codigo = t.codigo_empleado
  JOIN clientes c ON c.codigo = t.codigo_cliente
`;

const TICKET_CALENDAR_SELECT = `
  SELECT t.id, t.fecha_inicio, t.fecha_fin, t.codigo_empleado, t.codigo_cliente,
         t.reporte_cliente, t.accesos, t.notas, t.status, t.prioridad,
         emp.nombre AS empleado_nombre, emp.color AS empleado_color,
         c.nombre_empresa AS cliente_empresa, c.nombre_cliente AS cliente_nombre,
         c.telefono AS cliente_telefono
  FROM tickets t
  LEFT JOIN empleados emp ON emp.codigo = t.codigo_empleado
  JOIN clientes c ON c.codigo = t.codigo_cliente
`;

const TICKET_SELECT = `
  SELECT t.id, t.fecha_inicio, t.fecha_fin, t.codigo_empleado, t.codigo_cliente,
         t.reporte_cliente, t.reporte_tecnico, t.accesos, t.notas, t.insumos, t.totalprecio,
         t.status, t.prioridad, t.foto1, t.foto2, t.foto3,
         emp.nombre AS empleado_nombre,
         c.nombre_empresa AS cliente_empresa, c.nombre_cliente AS cliente_nombre,
         c.telefono AS cliente_telefono
  FROM tickets t
  LEFT JOIN empleados emp ON emp.codigo = t.codigo_empleado
  JOIN clientes c ON c.codigo = t.codigo_cliente
`;

async function mapTicketRow(row, includePhotos = false) {
  const data = {
    id: row.id,
    fecha_inicio: toDateString(row.fecha_inicio),
    fecha_fin: toDateString(row.fecha_fin),
    codigo_empleado: row.codigo_empleado,
    codigo_cliente: row.codigo_cliente,
    reporte_cliente: row.reporte_cliente,
    reporte_tecnico: row.reporte_tecnico,
    accesos: row.accesos,
    notas: row.notas,
    insumos: row.insumos,
    totalprecio: row.totalprecio != null ? Number(row.totalprecio) : null,
    status: row.status || 'PENDIENTE',
    prioridad: row.prioridad || 'MEDIA',
    empleado_nombre: row.empleado_nombre || 'Sin asignar',
    cliente_empresa: row.cliente_empresa,
    cliente_nombre: row.cliente_nombre,
    cliente_telefono: row.cliente_telefono,
  };
  if (includePhotos) {
    const photos = await loadTicketPhotos(row.id, row);
    data.foto1 = photos.foto1;
    data.foto2 = photos.foto2;
    data.foto3 = photos.foto3;
  }
  return data;
}

router.post(
  '/tickets/list',
  asyncHandler(async (req, res) => {
    let sql = `${TICKET_LIST_SELECT} WHERE t.status = 'PENDIENTE'`;
    const params = [];
    if (req.auth.tipo === 'TECNICO') {
      sql += ' AND t.codigo_empleado = ?';
      params.push(req.auth.empleado_codigo);
    }
    sql += ' ORDER BY t.fecha_inicio ASC, t.id ASC';
    const rows = await query(sql, params);
    res.json(await Promise.all(rows.map((row) => mapTicketRow(row))));
  })
);

router.post(
  '/tickets/calendar',
  asyncHandler(async (req, res) => {
    const { start, end } = req.body || {};
    if (!start || !end) {
      return res.status(400).json({ error: 'Los parámetros start y end son obligatorios.' });
    }

    const startDate = String(start).slice(0, 10);
    const endDate = String(end).slice(0, 10);
    const rows = await query(
      `${TICKET_CALENDAR_SELECT}
       WHERE t.fecha_inicio < ? AND COALESCE(t.fecha_fin, t.fecha_inicio) >= ?
       ORDER BY t.fecha_inicio ASC, t.id ASC`,
      [endDate, startDate]
    );
    const tickets = filterTicketsForAuth(rows, req.auth).map(mapTicketToCalendarEvent);
    res.json(tickets);
  })
);

router.post(
  '/tickets/get',
  asyncHandler(async (req, res) => {
    const id = Number(req.body?.id);
    const row = await queryOne(`${TICKET_SELECT} WHERE t.id = ?`, [id]);
    if (!row) return res.status(404).json({ error: 'Ticket no encontrado.' });
    if (!canAccessTicket(row, req.auth)) {
      return res.status(403).json({ error: 'No autorizado.' });
    }
    res.json(await mapTicketRow(row, true));
  })
);

router.post(
  '/tickets/create',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const result = validateTicket(req.body);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

    if (result.data.codigo_empleado && !(await empleadoExists(result.data.codigo_empleado))) {
      return res.status(400).json({ error: 'El empleado seleccionado no existe.' });
    }
    if (!(await clienteExists(result.data.codigo_cliente))) {
      return res.status(400).json({ error: 'El cliente seleccionado no existe.' });
    }

    const info = await execute(
      `INSERT INTO tickets (fecha_inicio, fecha_fin, codigo_empleado, codigo_cliente,
       reporte_cliente, reporte_tecnico, accesos, notas, insumos, totalprecio, status, prioridad)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.data.fecha_inicio,
        result.data.fecha_fin,
        result.data.codigo_empleado,
        result.data.codigo_cliente,
        result.data.reporte_cliente,
        result.data.reporte_tecnico,
        result.data.accesos,
        result.data.notas,
        result.data.insumos ?? null,
        result.data.totalprecio ?? null,
        result.data.status,
        result.data.prioridad,
      ]
    );

    const row = await queryOne(`${TICKET_SELECT} WHERE t.id = ?`, [info.insertId]);
    res.status(201).json(await mapTicketRow(row, true));
  })
);

router.post(
  '/tickets/update',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const id = Number(req.body?.id);
    const existing = await queryOne('SELECT id FROM tickets WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado.' });

    const current = await queryOne(
      `SELECT fecha_inicio, fecha_fin, codigo_empleado, codigo_cliente, reporte_cliente,
              reporte_tecnico, accesos, notas, insumos, totalprecio, status, prioridad
       FROM tickets WHERE id = ?`,
      [id]
    );

    const merged = {
      fecha_inicio:
        req.body.fecha_inicio !== undefined
          ? req.body.fecha_inicio
          : toDateString(current.fecha_inicio),
      fecha_fin:
        req.body.fecha_fin !== undefined ? req.body.fecha_fin : toDateString(current.fecha_fin),
      codigo_empleado:
        req.body.codigo_empleado !== undefined
          ? req.body.codigo_empleado
          : current.codigo_empleado,
      codigo_cliente:
        req.body.codigo_cliente !== undefined ? req.body.codigo_cliente : current.codigo_cliente,
      reporte_cliente:
        req.body.reporte_cliente !== undefined
          ? req.body.reporte_cliente
          : current.reporte_cliente,
      reporte_tecnico:
        req.body.reporte_tecnico !== undefined
          ? req.body.reporte_tecnico
          : current.reporte_tecnico,
      accesos: req.body.accesos !== undefined ? req.body.accesos : current.accesos,
      notas: req.body.notas !== undefined ? req.body.notas : current.notas,
      insumos: req.body.insumos !== undefined ? req.body.insumos : current.insumos,
      totalprecio:
        req.body.totalprecio !== undefined ? req.body.totalprecio : current.totalprecio,
      status: req.body.status !== undefined ? req.body.status : current.status,
      prioridad: req.body.prioridad !== undefined ? req.body.prioridad : current.prioridad,
    };

    const result = validateTicket(merged);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

    if (result.data.codigo_empleado && !(await empleadoExists(result.data.codigo_empleado))) {
      return res.status(400).json({ error: 'El empleado seleccionado no existe.' });
    }
    if (!(await clienteExists(result.data.codigo_cliente))) {
      return res.status(400).json({ error: 'El cliente seleccionado no existe.' });
    }

    await execute(
      `UPDATE tickets SET fecha_inicio = ?, fecha_fin = ?, codigo_empleado = ?, codigo_cliente = ?,
       reporte_cliente = ?, reporte_tecnico = ?, accesos = ?, notas = ?, insumos = ?,
       totalprecio = ?, status = ?, prioridad = ?
       WHERE id = ?`,
      [
        result.data.fecha_inicio,
        result.data.fecha_fin,
        result.data.codigo_empleado,
        result.data.codigo_cliente,
        result.data.reporte_cliente,
        result.data.reporte_tecnico,
        result.data.accesos,
        result.data.notas,
        result.data.insumos,
        result.data.totalprecio,
        result.data.status,
        result.data.prioridad,
        id,
      ]
    );

    const row = await queryOne(`${TICKET_SELECT} WHERE t.id = ?`, [id]);
    res.json(await mapTicketRow(row, true));
  })
);

router.post(
  '/tickets/finalizar',
  asyncHandler(async (req, res) => {
    const id = Number(req.body?.id);
    const existing = await queryOne(
      `SELECT id, status, codigo_empleado, reporte_tecnico, accesos, notas, insumos, totalprecio,
              foto1, foto2, foto3
       FROM tickets WHERE id = ?`,
      [id]
    );
    const existingPhotos = await loadTicketPhotos(id, existing);
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado.' });
    if (!canAccessTicket(existing, req.auth)) {
      return res.status(403).json({ error: 'No autorizado.' });
    }
    if (existing.status === 'FINALIZADO') {
      return res.status(400).json({ error: 'El ticket ya está finalizado.' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const fechaFinInput = req.body.fecha_fin !== undefined ? req.body.fecha_fin : today;
    const fechaFinParsed = parseDateOnly(fechaFinInput, 'Fecha fin');
    if (!fechaFinParsed.valid) {
      return res.status(400).json({ error: fechaFinParsed.error });
    }

    const reporteTecnico =
      req.body.reporte_tecnico !== undefined
        ? sanitizeMysqlText(req.body.reporte_tecnico)
        : existing.reporte_tecnico;
    const accesos =
      req.body.accesos !== undefined ? sanitizeMysqlText(req.body.accesos) : undefined;
    const notas = req.body.notas !== undefined ? sanitizeMysqlText(req.body.notas) : undefined;
    const insumos =
      req.body.insumos !== undefined ? sanitizeMysqlText(req.body.insumos) : undefined;

    let totalprecio = existing.totalprecio;
    if (req.body.totalprecio !== undefined) {
      if (req.body.totalprecio === null || req.body.totalprecio === '') {
        totalprecio = null;
      } else {
        const num = Number(req.body.totalprecio);
        if (Number.isNaN(num) || num < 0) {
          return res.status(400).json({ error: 'Total precio debe ser un número mayor o igual a 0.' });
        }
        totalprecio = Math.round(num * 100) / 100;
      }
    }

    await execute(
      `UPDATE tickets SET status = 'FINALIZADO', fecha_fin = ?, reporte_tecnico = ?,
       accesos = COALESCE(?, accesos), notas = COALESCE(?, notas), insumos = COALESCE(?, insumos),
       totalprecio = ? WHERE id = ?`,
      [fechaFinParsed.iso, reporteTecnico, accesos, notas, insumos, totalprecio, id]
    );

    await saveTicketPhotos(
      id,
      {
        foto1: req.body.foto1,
        foto2: req.body.foto2,
        foto3: req.body.foto3,
      },
      existingPhotos
    );

    const row = await queryOne(`${TICKET_SELECT} WHERE t.id = ?`, [id]);
    res.json(await mapTicketRow(row, true));
  })
);

router.post(
  '/tickets/asignar',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const id = Number(req.body?.id);
    const codigoEmpleado = Number(req.body?.codigo_empleado);
    const existing = await queryOne('SELECT id FROM tickets WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado.' });
    if (!Number.isInteger(codigoEmpleado) || codigoEmpleado <= 0) {
      return res.status(400).json({ error: 'Debe seleccionar un empleado válido.' });
    }
    if (!(await empleadoExists(codigoEmpleado))) {
      return res.status(400).json({ error: 'El empleado seleccionado no existe.' });
    }

    await execute('UPDATE tickets SET codigo_empleado = ? WHERE id = ?', [codigoEmpleado, id]);
    const row = await queryOne(`${TICKET_SELECT} WHERE t.id = ?`, [id]);
    res.json(await mapTicketRow(row, true));
  })
);

router.post(
  '/tickets/archivo',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const { start, end } = req.body || {};
    if (!start || !end) {
      return res.status(400).json({ error: 'Los parámetros start y end son obligatorios.' });
    }
    const startDate = String(start).slice(0, 10);
    const endDate = String(end).slice(0, 10);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'La fecha inicial no puede ser mayor que la final.' });
    }

    const rows = await query(
      `${TICKET_SELECT}
       WHERE t.fecha_inicio >= ? AND t.fecha_inicio <= ?
       ORDER BY t.fecha_inicio ASC, t.id ASC`,
      [startDate, endDate]
    );
    res.json(await Promise.all(rows.map((row) => mapTicketRow(row, true))));
  })
);

router.post(
  '/tickets/delete-fotos',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const { start, end } = req.body || {};
    if (!start || !end) {
      return res.status(400).json({ error: 'Las fechas inicial y final son obligatorias.' });
    }
    const startDate = String(start).slice(0, 10);
    const endDate = String(end).slice(0, 10);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'La fecha inicial no puede ser mayor que la final.' });
    }

    const fotoRows = await query(
      `SELECT t.id AS id_ticket, tf.FOTO1, tf.FOTO2, tf.FOTO3, t.foto1, t.foto2, t.foto3
       FROM tickets t
       LEFT JOIN tickets_fotos tf ON tf.ID_TICKET = t.id
       WHERE t.fecha_inicio >= ? AND t.fecha_inicio <= ?
         AND (tf.FOTO1 IS NOT NULL OR tf.FOTO2 IS NOT NULL OR tf.FOTO3 IS NOT NULL
              OR t.foto1 IS NOT NULL OR t.foto2 IS NOT NULL OR t.foto3 IS NOT NULL)`,
      [startDate, endDate]
    );

    const ticketIds = new Set();
    let filesDeleted = 0;
    const filesSeen = new Set();

    for (const row of fotoRows) {
      ticketIds.add(row.id_ticket);
      const filenames = [
        row.FOTO1,
        row.FOTO2,
        row.FOTO3,
        row.foto1,
        row.foto2,
        row.foto3,
      ].filter(Boolean);
      for (const filename of filenames) {
        if (filesSeen.has(filename)) continue;
        filesSeen.add(filename);
        if (deletePhotoFile(filename)) filesDeleted += 1;
      }
    }

    if (ticketIds.size) {
      const ids = [...ticketIds];
      const placeholders = ids.map(() => '?').join(', ');
      await execute(`DELETE FROM tickets_fotos WHERE ID_TICKET IN (${placeholders})`, ids);
    }

    res.json({
      ok: true,
      tickets: ticketIds.size,
      filesDeleted,
    });
  })
);

router.post(
  '/tickets/delete',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const id = Number(req.body?.id);
    const existing = await queryOne('SELECT id FROM tickets WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado.' });

    await execute('DELETE FROM tickets WHERE id = ?', [id]);
    res.json({ ok: true });
  })
);

router.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = router;
