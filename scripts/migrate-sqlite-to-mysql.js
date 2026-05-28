const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { query, execute, getPool, initDb } = require('../server/db');

const sqlitePath = path.join(__dirname, '..', 'data', 'calendario.db');

async function resetAutoIncrement(table, column) {
  const row = await query(`SELECT COALESCE(MAX(${column}), 0) + 1 AS next_id FROM ${table}`);
  await query(`ALTER TABLE ${table} AUTO_INCREMENT = ?`, [row[0].next_id]);
}

async function migrate() {
  if (!require('fs').existsSync(sqlitePath)) {
    throw new Error(`No se encontró SQLite en ${sqlitePath}`);
  }

  const sqlite = new Database(sqlitePath, { readonly: true });

  const empleados = sqlite.prepare('SELECT * FROM empleados ORDER BY codigo').all();
  const clientes = sqlite.prepare('SELECT * FROM clientes ORDER BY codigo').all();
  const eventos = sqlite.prepare('SELECT * FROM eventos ORDER BY id').all();
  const cotizaciones = sqlite
    .prepare('SELECT * FROM cotizaciones ORDER BY id')
    .all();

  sqlite.close();

  await initDb();

  await query('SET FOREIGN_KEY_CHECKS = 0');
  await query('TRUNCATE TABLE cotizaciones');
  await query('TRUNCATE TABLE eventos');
  await query('TRUNCATE TABLE clientes');
  await query('TRUNCATE TABLE empleados');
  await query('SET FOREIGN_KEY_CHECKS = 1');

  for (const row of empleados) {
    await execute(
      `INSERT INTO empleados (codigo, nombre, telefono, tipo, estado, clave, color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        row.codigo,
        row.nombre,
        row.telefono,
        row.tipo || 'TECNICO',
        row.estado || 'ACTIVO',
        row.clave || '1234',
        row.color || '#7c3aed',
      ]
    );
  }

  for (const row of clientes) {
    await execute(
      `INSERT INTO clientes (codigo, nombre_empresa, nombre_cliente, direccion, latitud, longitud)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        row.codigo,
        row.nombre_empresa,
        row.nombre_cliente,
        row.direccion,
        row.latitud,
        row.longitud,
      ]
    );
  }

  for (const row of eventos) {
    await execute(
      `INSERT INTO eventos (id, titulo, descripcion, observaciones, inicio, fin, empleado_codigo,
       cliente_codigo, estatus, totalprecio, cotizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.titulo,
        row.descripcion,
        row.observaciones,
        row.inicio,
        row.fin,
        row.empleado_codigo,
        row.cliente_codigo,
        row.estatus || 'pendiente',
        row.totalprecio,
        row.cotizado,
      ]
    );
  }

  for (const row of cotizaciones) {
    await execute(
      `INSERT INTO cotizaciones (id, fecha, cliente, telefono, vence, totalprecio, detalles, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.fecha,
        row.cliente,
        row.telefono,
        row.vence,
        row.totalprecio,
        row.detalles,
        row.status || 'PENDIENTE',
      ]
    );
  }

  await resetAutoIncrement('empleados', 'codigo');
  await resetAutoIncrement('clientes', 'codigo');
  await resetAutoIncrement('eventos', 'id');
  await resetAutoIncrement('cotizaciones', 'id');

  console.log('Migración completada:');
  console.log(`  empleados: ${empleados.length}`);
  console.log(`  clientes: ${clientes.length}`);
  console.log(`  eventos: ${eventos.length}`);
  console.log(`  cotizaciones: ${cotizaciones.length}`);
}

migrate()
  .catch((err) => {
    console.error('Error en migración:', err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    getPool().end();
  });
