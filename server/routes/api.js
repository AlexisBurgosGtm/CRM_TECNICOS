const express = require('express');
const { query, queryOne, execute, toDateString } = require('../db');
const { login, logout, setSessionEmpresa, requireAuth, requireSupervisor, requireSuperUser, isSuperUserName, getEmpnit } = require('../auth');
const { empnitSql } = require('../tenant');
const {
  validateEmpleado,
  validateCliente,
  validateTicket,
  validateEmpresa,
  parseDateOnly,
  sanitizeMysqlText,
} = require('../validators');
const { deletePhotoFile, isHexPhoto, normalizePhotoForClient } = require('../photos');
const { loadTicketPhotos, saveTicketPhotos } = require('../ticket-photos');
const { verifyEmpresaClave, empresaClaveConfigurada } = require('../empresa-clave');

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

function mapEmpresaRow(row) {
  return {
    empnit: row.EMPNIT,
    empresa: row.EMPRESA,
    activa: row.ACTIVA,
  };
}

function hiddenEmployeeClause(alias = '') {
  const col = alias ? `${alias}.nombre` : 'nombre';
  return `UPPER(${col}) <> 'ALEXIS BURGOS'`;
}

function requireSessionEmpnit(auth, res) {
  const empnit = getEmpnit(auth);
  if (!empnit) {
    res.status(403).json({ error: 'Sesión sin empresa asignada.' });
    return null;
  }
  return empnit;
}

async function requireDeleteClave(req, res, empnit) {
  const error = await verifyEmpresaClave(empnit, req.body?.clave);
  if (error) {
    res.status(403).json({ error });
    return false;
  }
  return true;
}

async function empleadoExists(codigo, empnit) {
  const row = await queryOne(
    `SELECT codigo FROM empleados WHERE codigo = ? AND ${empnitSql()}`,
    [codigo, empnit]
  );
  return Boolean(row);
}

async function clienteExists(codigo, empnit) {
  const row = await queryOne(
    `SELECT codigo FROM clientes WHERE codigo = ? AND ${empnitSql()}`,
    [codigo, empnit]
  );
  return Boolean(row);
}

function filterTicketsForAuth(rows, auth) {
  if (auth.tipo === 'TECNICO') {
    return rows.filter((r) => r.codigo_empleado === auth.empleado_codigo);
  }
  return rows;
}

function canAccessTicket(ticket, auth) {
  const empnit = getEmpnit(auth);
  if (ticket.EMPNIT && empnit && ticket.EMPNIT !== empnit) return false;
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

router.post(
  '/auth/set-empresa',
  requireAuth,
  requireSuperUser,
  asyncHandler(async (req, res) => {
    const empnit = String(req.body?.empnit || '').trim();
    const updated = await setSessionEmpresa(req.auth.token, empnit);
    if (!updated) {
      return res.status(404).json({ error: 'Empresa no encontrada.' });
    }
    res.json(updated);
  })
);

router.use(requireAuth);

router.post(
  '/empleados/list',
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const onlyActivos = req.body?.soloActivos === true;
    const hidden = hiddenEmployeeClause();
    const sql = onlyActivos
      ? `SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados
         WHERE ${empnitSql()} AND estado = 'ACTIVO' AND ${hidden} ORDER BY nombre`
      : `SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados
         WHERE ${empnitSql()} AND ${hidden} ORDER BY nombre`;
    res.json(await query(sql, [empnit]));
  })
);

router.post(
  '/empleados/get',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const codigo = Number(req.body?.codigo);
    const row = await queryOne(
      `SELECT codigo, nombre, telefono, tipo, estado, clave, color FROM empleados
       WHERE codigo = ? AND ${empnitSql()}`,
      [codigo, empnit]
    );
    if (!row) return res.status(404).json({ error: 'Empleado no encontrado.' });
    if (isSuperUserName(row.nombre)) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }
    res.json(mapEmpleadoRow(row, true));
  })
);

router.post(
  '/empleados/create',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const result = validateEmpleado(req.body);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });
    if (isSuperUserName(result.data.nombre)) {
      return res.status(400).json({ error: 'No se puede crear ese empleado.' });
    }

    const info = await execute(
      'INSERT INTO empleados (EMPNIT, nombre, telefono, tipo, estado, clave, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        empnit,
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
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const codigo = Number(req.body?.codigo);
    const existing = await queryOne(
      `SELECT codigo, clave, nombre FROM empleados WHERE codigo = ? AND ${empnitSql()}`,
      [codigo, empnit]
    );
    if (!existing) return res.status(404).json({ error: 'Empleado no encontrado.' });
    if (isSuperUserName(existing.nombre)) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    const merged = {
      ...req.body,
      clave:
        req.body.clave !== undefined && String(req.body.clave).length > 0
          ? req.body.clave
          : existing.clave,
    };

    const result = validateEmpleado(merged);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });
    if (isSuperUserName(result.data.nombre)) {
      return res.status(400).json({ error: 'No se puede usar ese nombre.' });
    }

    await execute(
      'UPDATE empleados SET nombre = ?, telefono = ?, tipo = ?, estado = ?, clave = ?, color = ? WHERE codigo = ? AND EMPNIT = ?',
      [
        result.data.nombre,
        result.data.telefono,
        result.data.tipo,
        result.data.estado,
        result.data.clave,
        result.data.color,
        codigo,
        empnit,
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
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const codigo = Number(req.body?.codigo);
    const existing = await queryOne(
      `SELECT codigo, nombre FROM empleados WHERE codigo = ? AND ${empnitSql()}`,
      [codigo, empnit]
    );
    if (!existing) return res.status(404).json({ error: 'Empleado no encontrado.' });
    if (isSuperUserName(existing.nombre)) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    const ticketCount = await queryOne(
      `SELECT COUNT(*) AS total FROM tickets WHERE codigo_empleado = ? AND ${empnitSql()}`,
      [codigo, empnit]
    );
    if (Number(ticketCount.total) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar el empleado porque tiene tickets asociados.',
      });
    }

    if (!(await requireDeleteClave(req, res, empnit))) return;

    await execute('DELETE FROM empleados WHERE codigo = ? AND EMPNIT = ?', [codigo, empnit]);
    res.json({ ok: true });
  })
);

router.post(
  '/clientes/list',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const rows = await query(
      `SELECT codigo, nombre_empresa, nombre_cliente, telefono, direccion, latitud, longitud,
              fac_nit, fac_nombre, fac_direccion
       FROM clientes WHERE ${empnitSql()} ORDER BY nombre_empresa, nombre_cliente`,
      [empnit]
    );
    res.json(rows);
  })
);

router.post(
  '/clientes/get',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const codigo = Number(req.body?.codigo);
    const row = await queryOne(
      `SELECT codigo, nombre_empresa, nombre_cliente, telefono, direccion, latitud, longitud,
              fac_nit, fac_nombre, fac_direccion
       FROM clientes WHERE codigo = ? AND ${empnitSql()}`,
      [codigo, empnit]
    );
    if (!row) return res.status(404).json({ error: 'Cliente no encontrado.' });
    res.json(row);
  })
);

router.post(
  '/clientes/create',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const result = validateCliente(req.body);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

    const info = await execute(
      `INSERT INTO clientes (EMPNIT, nombre_empresa, nombre_cliente, telefono, direccion, latitud, longitud,
        fac_nit, fac_nombre, fac_direccion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        empnit,
        result.data.nombre_empresa,
        result.data.nombre_cliente,
        result.data.telefono,
        result.data.direccion,
        result.data.latitud,
        result.data.longitud,
        result.data.fac_nit ?? null,
        result.data.fac_nombre ?? null,
        result.data.fac_direccion ?? null,
      ]
    );

    const row = await queryOne(
      `SELECT codigo, nombre_empresa, nombre_cliente, telefono, direccion, latitud, longitud,
              fac_nit, fac_nombre, fac_direccion
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
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const codigo = Number(req.body?.codigo);
    const existing = await queryOne(
      `SELECT codigo FROM clientes WHERE codigo = ? AND ${empnitSql()}`,
      [codigo, empnit]
    );
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const result = validateCliente(req.body);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

    await execute(
      `UPDATE clientes SET nombre_empresa = ?, nombre_cliente = ?, telefono = ?, direccion = ?, latitud = ?, longitud = ?,
       fac_nit = ?, fac_nombre = ?, fac_direccion = ?
       WHERE codigo = ? AND EMPNIT = ?`,
      [
        result.data.nombre_empresa,
        result.data.nombre_cliente,
        result.data.telefono,
        result.data.direccion,
        result.data.latitud,
        result.data.longitud,
        result.data.fac_nit ?? null,
        result.data.fac_nombre ?? null,
        result.data.fac_direccion ?? null,
        codigo,
        empnit,
      ]
    );

    const row = await queryOne(
      `SELECT codigo, nombre_empresa, nombre_cliente, telefono, direccion, latitud, longitud,
              fac_nit, fac_nombre, fac_direccion
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
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const codigo = Number(req.body?.codigo);
    const existing = await queryOne(
      `SELECT codigo FROM clientes WHERE codigo = ? AND ${empnitSql()}`,
      [codigo, empnit]
    );
    if (!existing) return res.status(404).json({ error: 'Cliente no encontrado.' });

    const ticketCount = await queryOne(
      `SELECT COUNT(*) AS total FROM tickets WHERE codigo_cliente = ? AND ${empnitSql()}`,
      [codigo, empnit]
    );
    if (Number(ticketCount.total) > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar el cliente porque tiene tickets asociados.',
      });
    }

    if (!(await requireDeleteClave(req, res, empnit))) return;

    await execute('DELETE FROM clientes WHERE codigo = ? AND EMPNIT = ?', [codigo, empnit]);
    res.json({ ok: true });
  })
);

router.post(
  '/empresas/list',
  requireSuperUser,
  asyncHandler(async (req, res) => {
    const rows = await query('SELECT EMPNIT, EMPRESA, ACTIVA FROM empresas ORDER BY EMPRESA, EMPNIT');
    res.json(rows.map(mapEmpresaRow));
  })
);

router.post(
  '/empresas/get',
  requireSuperUser,
  asyncHandler(async (req, res) => {
    const empnit = String(req.body?.empnit || '').trim();
    const row = await queryOne('SELECT EMPNIT, EMPRESA, ACTIVA FROM empresas WHERE EMPNIT = ?', [empnit]);
    if (!row) return res.status(404).json({ error: 'Empresa no encontrada.' });
    res.json(mapEmpresaRow(row));
  })
);

router.post(
  '/empresas/create',
  requireSuperUser,
  asyncHandler(async (req, res) => {
    const result = validateEmpresa(req.body);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

    const existing = await queryOne('SELECT EMPNIT FROM empresas WHERE EMPNIT = ?', [result.data.empnit]);
    if (existing) return res.status(409).json({ error: 'Ya existe una empresa con ese NIT.' });

    await execute('INSERT INTO empresas (EMPNIT, EMPRESA, ACTIVA) VALUES (?, ?, ?)', [
      result.data.empnit,
      result.data.empresa,
      result.data.activa,
    ]);

    const row = await queryOne('SELECT EMPNIT, EMPRESA, ACTIVA FROM empresas WHERE EMPNIT = ?', [
      result.data.empnit,
    ]);
    res.status(201).json(mapEmpresaRow(row));
  })
);

router.post(
  '/empresas/update',
  requireSuperUser,
  asyncHandler(async (req, res) => {
    const empnit = String(req.body?.empnit || '').trim();
    const existing = await queryOne('SELECT EMPNIT FROM empresas WHERE EMPNIT = ?', [empnit]);
    if (!existing) return res.status(404).json({ error: 'Empresa no encontrada.' });

    const result = validateEmpresa(req.body);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

    await execute('UPDATE empresas SET EMPRESA = ?, ACTIVA = ? WHERE EMPNIT = ?', [
      result.data.empresa,
      result.data.activa,
      empnit,
    ]);

    const row = await queryOne('SELECT EMPNIT, EMPRESA, ACTIVA FROM empresas WHERE EMPNIT = ?', [empnit]);
    res.json(mapEmpresaRow(row));
  })
);

router.post(
  '/empresas/delete',
  requireSuperUser,
  asyncHandler(async (req, res) => {
    const empnit = String(req.body?.empnit || '').trim();
    const existing = await queryOne('SELECT EMPNIT FROM empresas WHERE EMPNIT = ?', [empnit]);
    if (!existing) return res.status(404).json({ error: 'Empresa no encontrada.' });

    if (!(await requireDeleteClave(req, res, empnit))) return;

    await execute('DELETE FROM empresas WHERE EMPNIT = ?', [empnit]);
    res.json({ ok: true });
  })
);

router.post(
  '/empresa-clave/status',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const row = await queryOne('SELECT EMPRESA FROM empresas WHERE EMPNIT = ?', [empnit]);
    if (!row) return res.status(404).json({ error: 'Empresa no encontrada.' });

    res.json({
      empnit,
      empresa: row.EMPRESA || empnit,
      configurada: await empresaClaveConfigurada(empnit),
    });
  })
);

router.post(
  '/empresa-clave/update',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const clave = String(req.body?.clave || '').trim();
    if (!clave) return res.status(400).json({ error: 'La clave es obligatoria.' });
    if (clave.length > 64) {
      return res.status(400).json({ error: 'La clave no puede superar 64 caracteres.' });
    }

    const existing = await queryOne('SELECT EMPNIT FROM empresas WHERE EMPNIT = ?', [empnit]);
    if (!existing) return res.status(404).json({ error: 'Empresa no encontrada.' });

    await execute('UPDATE empresas SET CLAVE = ? WHERE EMPNIT = ?', [clave, empnit]);
    res.json({ ok: true, configurada: true });
  })
);

router.post(
  '/dashboard/resumen',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const { start, end } = req.body || {};
    if (!start || !end) {
      return res.status(400).json({ error: 'Los parámetros start y end son obligatorios.' });
    }

    const startDate = String(start).slice(0, 10);
    const endDate = String(end).slice(0, 10);

    const ticketRows = await query(
      `${TICKET_LIST_SELECT}
       WHERE ${empnitSql('t')} AND t.fecha_inicio < ? AND COALESCE(t.fecha_fin, t.fecha_inicio) >= ?
       ORDER BY t.fecha_inicio ASC, t.id ASC`,
      [empnit, endDate, startDate]
    );
    const tickets = await Promise.all(ticketRows.map((row) => mapTicketRow(row)));

    const empleados = await query(
      `SELECT codigo, nombre, telefono, tipo, estado, color FROM empleados
       WHERE ${empnitSql()} AND estado = 'ACTIVO' AND ${hiddenEmployeeClause()} ORDER BY nombre`,
      [empnit]
    );

    const pendientesPorEmpleado = await query(
      `SELECT codigo_empleado, COUNT(*) AS pendientes FROM tickets
       WHERE ${empnitSql()} AND status = 'PENDIENTE' AND fecha_inicio < ? AND COALESCE(fecha_fin, fecha_inicio) >= ?
       GROUP BY codigo_empleado`,
      [empnit, endDate, startDate]
    );

    const pendientesMap = Object.fromEntries(
      pendientesPorEmpleado.map((r) => [r.codigo_empleado, Number(r.pendientes)])
    );

    const facturaRows = await query(
      `SELECT f.FECHA, f.IMPORTE
       FROM facturas f
       WHERE f.EMPNIT = ? AND f.PAGADA = 'SI' AND f.FECHA >= ? AND f.FECHA <= ?
       ORDER BY f.FECHA ASC`,
      [empnit, startDate, endDate]
    );

    res.json({
      tickets,
      facturas_pagadas: facturaRows.map((row) => ({
        fecha: toDateString(row.FECHA),
        total: row.IMPORTE != null ? Number(row.IMPORTE) : 0,
      })),
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
         t.DIRECCION, t.LATITUD, t.LONGITUD,
         emp.nombre AS empleado_nombre,
         c.nombre_empresa AS cliente_empresa, c.nombre_cliente AS cliente_nombre,
         c.telefono AS cliente_telefono, c.latitud AS cliente_latitud, c.longitud AS cliente_longitud
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
         t.status, t.prioridad, t.CONCRE, t.ABONOS, t.foto1, t.foto2, t.foto3,
         t.DIRECCION, t.LATITUD, t.LONGITUD,
         emp.nombre AS empleado_nombre,
         c.nombre_empresa AS cliente_empresa, c.nombre_cliente AS cliente_nombre,
         c.telefono AS cliente_telefono, c.direccion AS cliente_direccion,
         c.latitud AS cliente_latitud, c.longitud AS cliente_longitud
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
    concre: row.CONCRE || null,
    abonos: row.ABONOS != null ? Number(row.ABONOS) : null,
    status: row.status || 'PENDIENTE',
    prioridad: row.prioridad || 'MEDIA',
    empleado_nombre: row.empleado_nombre || 'Sin asignar',
    cliente_empresa: row.cliente_empresa,
    cliente_nombre: row.cliente_nombre,
    cliente_telefono: row.cliente_telefono,
    cliente_direccion: row.cliente_direccion,
    cliente_latitud: row.cliente_latitud != null ? Number(row.cliente_latitud) : null,
    cliente_longitud: row.cliente_longitud != null ? Number(row.cliente_longitud) : null,
    direccion: row.DIRECCION || null,
    latitud: row.LATITUD != null ? Number(row.LATITUD) : null,
    longitud: row.LONGITUD != null ? Number(row.LONGITUD) : null,
  };
  if (includePhotos) {
    const photos = await loadTicketPhotos(row.id, row);
    data.foto1 = normalizePhotoForClient(photos.foto1);
    data.foto2 = normalizePhotoForClient(photos.foto2);
    data.foto3 = normalizePhotoForClient(photos.foto3);
  }
  return data;
}

router.post(
  '/tickets/list',
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    let sql = `${TICKET_LIST_SELECT} WHERE ${empnitSql('t')} AND t.status = 'PENDIENTE'`;
    const params = [empnit];
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
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const { start, end } = req.body || {};
    if (!start || !end) {
      return res.status(400).json({ error: 'Los parámetros start y end son obligatorios.' });
    }

    const startDate = String(start).slice(0, 10);
    const endDate = String(end).slice(0, 10);
    const rows = await query(
      `${TICKET_CALENDAR_SELECT}
       WHERE ${empnitSql('t')} AND t.fecha_inicio < ? AND COALESCE(t.fecha_fin, t.fecha_inicio) >= ?
       ORDER BY t.fecha_inicio ASC, t.id ASC`,
      [empnit, endDate, startDate]
    );
    const tickets = filterTicketsForAuth(rows, req.auth).map(mapTicketToCalendarEvent);
    res.json(tickets);
  })
);

router.post(
  '/tickets/get',
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const id = Number(req.body?.id);
    const row = await queryOne(`${TICKET_SELECT} WHERE t.id = ? AND ${empnitSql('t')}`, [id, empnit]);
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
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const result = validateTicket(req.body);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

    if (result.data.codigo_empleado && !(await empleadoExists(result.data.codigo_empleado, empnit))) {
      return res.status(400).json({ error: 'El empleado seleccionado no existe.' });
    }
    if (!(await clienteExists(result.data.codigo_cliente, empnit))) {
      return res.status(400).json({ error: 'El cliente seleccionado no existe.' });
    }

    const info = await execute(
      `INSERT INTO tickets (EMPNIT, fecha_inicio, fecha_fin, codigo_empleado, codigo_cliente,
       reporte_cliente, reporte_tecnico, accesos, notas, insumos, totalprecio, status, prioridad,
       DIRECCION, LATITUD, LONGITUD)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        empnit,
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
        result.data.direccion ?? null,
        result.data.latitud ?? null,
        result.data.longitud ?? null,
      ]
    );

    const row = await queryOne(`${TICKET_SELECT} WHERE t.id = ? AND ${empnitSql('t')}`, [info.insertId, empnit]);
    res.status(201).json(await mapTicketRow(row, true));
  })
);

router.post(
  '/tickets/update',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const id = Number(req.body?.id);
    const existing = await queryOne(
      `SELECT id FROM tickets WHERE id = ? AND ${empnitSql()}`,
      [id, empnit]
    );
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado.' });

    const current = await queryOne(
      `SELECT fecha_inicio, fecha_fin, codigo_empleado, codigo_cliente, reporte_cliente,
              reporte_tecnico, accesos, notas, insumos, totalprecio, status, prioridad,
              DIRECCION, LATITUD, LONGITUD
       FROM tickets WHERE id = ? AND ${empnitSql()}`,
      [id, empnit]
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
      direccion: req.body.direccion !== undefined ? req.body.direccion : current.DIRECCION,
      latitud: req.body.latitud !== undefined ? req.body.latitud : current.LATITUD,
      longitud: req.body.longitud !== undefined ? req.body.longitud : current.LONGITUD,
    };

    const result = validateTicket(merged);
    if (!result.valid) return res.status(400).json({ error: result.errors.join(' ') });

    if (result.data.codigo_empleado && !(await empleadoExists(result.data.codigo_empleado, empnit))) {
      return res.status(400).json({ error: 'El empleado seleccionado no existe.' });
    }
    if (!(await clienteExists(result.data.codigo_cliente, empnit))) {
      return res.status(400).json({ error: 'El cliente seleccionado no existe.' });
    }

    await execute(
      `UPDATE tickets SET fecha_inicio = ?, fecha_fin = ?, codigo_empleado = ?, codigo_cliente = ?,
       reporte_cliente = ?, reporte_tecnico = ?, accesos = ?, notas = ?, insumos = ?,
       totalprecio = ?, status = ?, prioridad = ?, DIRECCION = ?, LATITUD = ?, LONGITUD = ?
       WHERE id = ? AND EMPNIT = ?`,
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
        result.data.direccion ?? null,
        result.data.latitud ?? null,
        result.data.longitud ?? null,
        id,
        empnit,
      ]
    );

    const row = await queryOne(`${TICKET_SELECT} WHERE t.id = ? AND ${empnitSql('t')}`, [id, empnit]);
    res.json(await mapTicketRow(row, true));
  })
);

router.post(
  '/tickets/upload-foto',
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const id = Number(req.body?.id);
    const slot = Number(req.body?.slot);
    if (![1, 2, 3].includes(slot)) {
      return res.status(400).json({ error: 'El número de foto debe ser 1, 2 o 3.' });
    }
    const foto = req.body?.foto;
    if (!foto || (typeof foto === 'object' && !foto.data && !foto.dataUrl)) {
      return res.status(400).json({ error: 'Debe enviar una imagen válida.' });
    }

    const existing = await queryOne(
      `SELECT id, status, codigo_empleado, EMPNIT, foto1, foto2, foto3 FROM tickets WHERE id = ? AND ${empnitSql()}`,
      [id, empnit]
    );
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado.' });
    if (!canAccessTicket(existing, req.auth)) {
      return res.status(403).json({ error: 'No autorizado.' });
    }

    const existingPhotos = await loadTicketPhotos(id, existing);
    const fotoKey = `foto${slot}`;
    await saveTicketPhotos(id, { [fotoKey]: foto }, existingPhotos, empnit);

    const row = await queryOne(`${TICKET_SELECT} WHERE t.id = ? AND ${empnitSql('t')}`, [id, empnit]);
    res.json(await mapTicketRow(row, true));
  })
);

router.post(
  '/tickets/finalizar',
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const id = Number(req.body?.id);
    const existing = await queryOne(
      `SELECT id, status, codigo_empleado, EMPNIT, reporte_tecnico, accesos, notas, insumos, totalprecio,
              foto1, foto2, foto3
       FROM tickets WHERE id = ? AND ${empnitSql()}`,
      [id, empnit]
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
       totalprecio = ? WHERE id = ? AND EMPNIT = ?`,
      [fechaFinParsed.iso, reporteTecnico, accesos, notas, insumos, totalprecio, id, empnit]
    );

    await saveTicketPhotos(
      id,
      {
        foto1: req.body.foto1,
        foto2: req.body.foto2,
        foto3: req.body.foto3,
      },
      existingPhotos,
      empnit
    );

    const row = await queryOne(`${TICKET_SELECT} WHERE t.id = ? AND ${empnitSql('t')}`, [id, empnit]);
    res.json(await mapTicketRow(row, true));
  })
);

router.post(
  '/tickets/asignar',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const id = Number(req.body?.id);
    const codigoEmpleado = Number(req.body?.codigo_empleado);
    const existing = await queryOne(
      `SELECT id FROM tickets WHERE id = ? AND ${empnitSql()}`,
      [id, empnit]
    );
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado.' });
    if (!Number.isInteger(codigoEmpleado) || codigoEmpleado <= 0) {
      return res.status(400).json({ error: 'Debe seleccionar un empleado válido.' });
    }
    if (!(await empleadoExists(codigoEmpleado, empnit))) {
      return res.status(400).json({ error: 'El empleado seleccionado no existe.' });
    }

    await execute('UPDATE tickets SET codigo_empleado = ? WHERE id = ? AND EMPNIT = ?', [
      codigoEmpleado,
      id,
      empnit,
    ]);
    const row = await queryOne(`${TICKET_SELECT} WHERE t.id = ? AND ${empnitSql('t')}`, [id, empnit]);
    res.json(await mapTicketRow(row, true));
  })
);

router.post(
  '/tickets/archivo',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

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
       WHERE ${empnitSql('t')} AND t.fecha_inicio >= ? AND t.fecha_inicio <= ?
       ORDER BY t.fecha_inicio ASC, t.id ASC`,
      [empnit, startDate, endDate]
    );
    res.json(await Promise.all(rows.map((row) => mapTicketRow(row, true))));
  })
);

router.post(
  '/facturacion/tickets-pendientes',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const rows = await query(
      `SELECT t.id, t.fecha_fin, t.fecha_inicio, t.totalprecio, t.codigo_cliente,
              c.nombre_empresa AS cliente_empresa, c.nombre_cliente AS cliente_nombre
       FROM tickets t
       JOIN clientes c ON c.codigo = t.codigo_cliente AND c.EMPNIT = t.EMPNIT
       WHERE ${empnitSql('t')} AND t.status = 'FINALIZADO' AND (t.IDFAC IS NULL OR t.IDFAC = 0)
       ORDER BY COALESCE(t.fecha_fin, t.fecha_inicio) DESC, t.id DESC`,
      [empnit]
    );

    res.json(
      rows.map((row) => ({
        id: row.id,
        fecha: toDateString(row.fecha_fin || row.fecha_inicio),
        cliente: row.cliente_empresa || row.cliente_nombre || '—',
        totalprecio: row.totalprecio != null ? Number(row.totalprecio) : null,
      }))
    );
  })
);

function mapFacturaRow(row) {
  return {
    id: row.IDFAC,
    idfac: row.IDFAC,
    serie: row.SERIE || null,
    numero: row.NUMERO || null,
    fecha: toDateString(row.FECHA),
    fecha_pagada: row.FECHA_PAGADA ? toDateString(row.FECHA_PAGADA) : null,
    total: row.IMPORTE != null ? Number(row.IMPORTE) : 0,
    pagada: String(row.PAGADA || 'NO').toUpperCase(),
    codigo: row.CODIGO,
    cliente: row.cliente_empresa || row.cliente_nombre || '—',
    fac_nit: row.fac_nit || null,
    fac_nombre: row.fac_nombre || null,
    fac_direccion: row.fac_direccion || null,
    ticket_id: row.ticket_id != null ? Number(row.ticket_id) : null,
  };
}

const FACTURA_SELECT = `
  SELECT f.IDFAC, f.SERIE, f.NUMERO, f.FECHA, f.FECHA_PAGADA, f.IMPORTE, f.PAGADA, f.CODIGO,
         c.nombre_empresa AS cliente_empresa, c.nombre_cliente AS cliente_nombre,
         c.fac_nit, c.fac_nombre, c.fac_direccion,
         t.id AS ticket_id
  FROM facturas f
  JOIN clientes c ON c.codigo = f.CODIGO AND c.EMPNIT = f.EMPNIT
  LEFT JOIN tickets t ON t.IDFAC = f.IDFAC AND t.EMPNIT = f.EMPNIT
`;

router.post(
  '/facturacion/facturas',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const year = Number(req.body?.year);
    const month = Number(req.body?.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Año inválido.' });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Mes inválido.' });
    }

    const rows = await query(
      `${FACTURA_SELECT}
       WHERE f.EMPNIT = ? AND YEAR(f.FECHA) = ? AND MONTH(f.FECHA) = ?
       ORDER BY f.FECHA DESC, f.IDFAC DESC`,
      [empnit, year, month]
    );

    res.json(rows.map(mapFacturaRow));
  })
);

router.post(
  '/facturas/archivo',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

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
      `${FACTURA_SELECT}
       WHERE f.EMPNIT = ? AND f.FECHA >= ? AND f.FECHA <= ?
       ORDER BY f.FECHA ASC, f.IDFAC ASC`,
      [empnit, startDate, endDate]
    );

    res.json(rows.map(mapFacturaRow));
  })
);

router.post(
  '/facturacion/emitir',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const ticketId = Number(req.body?.ticket_id);
    const ticket = await queryOne(
      `SELECT t.id, t.status, t.IDFAC, t.codigo_cliente, t.totalprecio
       FROM tickets t
       WHERE t.id = ? AND ${empnitSql('t')}`,
      [ticketId, empnit]
    );
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado.' });
    if (ticket.status !== 'FINALIZADO') {
      return res.status(400).json({ error: 'Solo se pueden facturar tickets finalizados.' });
    }
    if (ticket.IDFAC != null && Number(ticket.IDFAC) !== 0) {
      return res.status(409).json({ error: 'El ticket ya tiene factura asociada.' });
    }

    const total = ticket.totalprecio != null ? Number(ticket.totalprecio) : 0;
    const fecha = new Date().toISOString().slice(0, 10);

    const info = await execute(
      `INSERT INTO facturas (EMPNIT, FECHA, CODIGO, IMPORTE, PAGADA) VALUES (?, ?, ?, ?, 'NO')`,
      [empnit, fecha, ticket.codigo_cliente, total]
    );

    await execute('UPDATE tickets SET IDFAC = ? WHERE id = ? AND EMPNIT = ?', [
      info.insertId,
      ticketId,
      empnit,
    ]);

    const row = await queryOne(
      `${FACTURA_SELECT}
       WHERE f.IDFAC = ? AND f.EMPNIT = ?`,
      [info.insertId, empnit]
    );

    res.status(201).json({ ...mapFacturaRow(row), ticket_id: ticketId });
  })
);

router.post(
  '/facturacion/factura/get',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const idfac = Number(req.body?.idfac);
    if (!Number.isInteger(idfac) || idfac <= 0) {
      return res.status(400).json({ error: 'Factura inválida.' });
    }

    const row = await queryOne(
      `${FACTURA_SELECT}
       WHERE f.IDFAC = ? AND f.EMPNIT = ?`,
      [idfac, empnit]
    );
    if (!row) return res.status(404).json({ error: 'Factura no encontrada.' });

    res.json(mapFacturaRow(row));
  })
);

router.post(
  '/facturacion/factura/update',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const idfac = Number(req.body?.idfac);
    if (!Number.isInteger(idfac) || idfac <= 0) {
      return res.status(400).json({ error: 'Factura inválida.' });
    }

    const factura = await queryOne(
      'SELECT IDFAC, PAGADA FROM facturas WHERE IDFAC = ? AND EMPNIT = ?',
      [idfac, empnit]
    );
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada.' });
    if (String(factura.PAGADA || 'NO').toUpperCase() === 'SI') {
      return res.status(400).json({ error: 'No se puede editar una factura ya pagada.' });
    }

    const serie = sanitizeMysqlText(req.body?.serie ?? '') ?? '';
    const numero = sanitizeMysqlText(req.body?.numero ?? '') ?? '';
    if (serie.length > 255 || numero.length > 255) {
      return res.status(400).json({ error: 'Serie o número demasiado largos.' });
    }

    let importe = null;
    if (req.body?.importe !== undefined && req.body?.importe !== null && req.body?.importe !== '') {
      const parsed = Number(req.body.importe);
      if (Number.isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ error: 'El importe debe ser un número mayor o igual a cero.' });
      }
      importe = parsed;
    }

    await execute(
      'UPDATE facturas SET SERIE = ?, NUMERO = ?, IMPORTE = ? WHERE IDFAC = ? AND EMPNIT = ?',
      [serie || null, numero || null, importe, idfac, empnit]
    );

    const row = await queryOne(
      `${FACTURA_SELECT}
       WHERE f.IDFAC = ? AND f.EMPNIT = ?`,
      [idfac, empnit]
    );
    res.json(mapFacturaRow(row));
  })
);

router.post(
  '/facturacion/factura/marcar-pagada',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const idfac = Number(req.body?.idfac);
    if (!Number.isInteger(idfac) || idfac <= 0) {
      return res.status(400).json({ error: 'Factura inválida.' });
    }

    const fechaParsed = parseDateOnly(req.body?.fecha_pagada, 'Fecha de pago');
    if (!fechaParsed.valid) {
      return res.status(400).json({ error: fechaParsed.error });
    }

    const factura = await queryOne(
      'SELECT IDFAC, PAGADA FROM facturas WHERE IDFAC = ? AND EMPNIT = ?',
      [idfac, empnit]
    );
    if (!factura) return res.status(404).json({ error: 'Factura no encontrada.' });
    if (String(factura.PAGADA || 'NO').toUpperCase() === 'SI') {
      return res.status(400).json({ error: 'La factura ya está marcada como pagada.' });
    }

    await execute(
      `UPDATE facturas SET PAGADA = 'SI', FECHA_PAGADA = ? WHERE IDFAC = ? AND EMPNIT = ?`,
      [fechaParsed.iso, idfac, empnit]
    );

    const row = await queryOne(
      `${FACTURA_SELECT}
       WHERE f.IDFAC = ? AND f.EMPNIT = ?`,
      [idfac, empnit]
    );
    res.json(mapFacturaRow(row));
  })
);

router.post(
  '/config/database-size',
  requireSuperUser,
  asyncHandler(async (req, res) => {
    const row = await queryOne(
      `SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
       FROM information_schema.TABLES
       WHERE table_schema = DATABASE()`
    );
    res.json({
      size_mb: row?.size_mb != null ? Number(row.size_mb) : 0,
    });
  })
);

router.post(
  '/tickets/delete-fotos',
  requireSupervisor,
  asyncHandler(async (req, res) => {
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const { start, end } = req.body || {};
    if (!start || !end) {
      return res.status(400).json({ error: 'Las fechas inicial y final son obligatorias.' });
    }
    const startDate = String(start).slice(0, 10);
    const endDate = String(end).slice(0, 10);
    if (startDate > endDate) {
      return res.status(400).json({ error: 'La fecha inicial no puede ser mayor que la final.' });
    }

    if (!(await requireDeleteClave(req, res, empnit))) return;

    const fotoRows = await query(
      `SELECT t.id AS id_ticket, tf.FOTO1, tf.FOTO2, tf.FOTO3, t.foto1, t.foto2, t.foto3
       FROM tickets t
       LEFT JOIN tickets_fotos tf ON tf.ID_TICKET = t.id AND tf.EMPNIT = t.EMPNIT
       WHERE ${empnitSql('t')} AND t.fecha_inicio >= ? AND t.fecha_inicio <= ?
         AND (tf.FOTO1 IS NOT NULL OR tf.FOTO2 IS NOT NULL OR tf.FOTO3 IS NOT NULL
              OR t.foto1 IS NOT NULL OR t.foto2 IS NOT NULL OR t.foto3 IS NOT NULL)`,
      [empnit, startDate, endDate]
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
        if (isHexPhoto(filename)) continue;
        if (deletePhotoFile(filename)) filesDeleted += 1;
      }
    }

    if (ticketIds.size) {
      const ids = [...ticketIds];
      const placeholders = ids.map(() => '?').join(', ');
      await execute(
        `DELETE FROM tickets_fotos WHERE ID_TICKET IN (${placeholders}) AND EMPNIT = ?`,
        [...ids, empnit]
      );
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
    const empnit = requireSessionEmpnit(req.auth, res);
    if (!empnit) return;

    const id = Number(req.body?.id);
    const existing = await queryOne(
      `SELECT id FROM tickets WHERE id = ? AND ${empnitSql()}`,
      [id, empnit]
    );
    if (!existing) return res.status(404).json({ error: 'Ticket no encontrado.' });

    if (!(await requireDeleteClave(req, res, empnit))) return;

    await execute('DELETE FROM tickets WHERE id = ? AND EMPNIT = ?', [id, empnit]);
    res.json({ ok: true });
  })
);

router.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = router;
