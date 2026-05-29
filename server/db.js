const mysql = require('mysql');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectionLimit: 10,
  charset: 'utf8mb4',
  multipleStatements: true,
});

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function execute(sql, params = []) {
  const result = await query(sql, params);
  return {
    insertId: result.insertId,
    affectedRows: result.affectedRows,
  };
}

function toDateString(value) {
  if (value == null) return value;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS empleados (
    codigo INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(8) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'TECNICO',
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    clave VARCHAR(32) NOT NULL DEFAULT '1234',
    color VARCHAR(7) NOT NULL DEFAULT '#7c3aed'
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS clientes (
    codigo INT AUTO_INCREMENT PRIMARY KEY,
    nombre_empresa VARCHAR(255) NOT NULL,
    nombre_cliente VARCHAR(255) NOT NULL,
    telefono VARCHAR(8) NULL,
    direccion VARCHAR(500) NOT NULL,
    latitud DOUBLE NULL,
    longitud DOUBLE NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NULL,
    codigo_empleado INT NULL,
    codigo_cliente INT NOT NULL,
    reporte_cliente TEXT NULL,
    reporte_tecnico TEXT NULL,
    accesos VARCHAR(255) NULL,
    notas TEXT NULL,
    insumos LONGTEXT NULL,
    totalprecio DECIMAL(12, 2) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    prioridad VARCHAR(10) NOT NULL DEFAULT 'MEDIA',
    foto1 VARCHAR(255) NULL,
    foto2 VARCHAR(255) NULL,
    foto3 VARCHAR(255) NULL,
    CONSTRAINT fk_tickets_empleado FOREIGN KEY (codigo_empleado) REFERENCES empleados(codigo) ON DELETE RESTRICT,
    CONSTRAINT fk_tickets_cliente FOREIGN KEY (codigo_cliente) REFERENCES clientes(codigo) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE INDEX idx_tickets_fecha_inicio ON tickets(fecha_inicio)`,
  `CREATE INDEX idx_tickets_status ON tickets(status)`,
  `CREATE INDEX idx_tickets_empleado ON tickets(codigo_empleado)`,
  `CREATE INDEX idx_tickets_cliente ON tickets(codigo_cliente)`,
  `CREATE TABLE IF NOT EXISTS tickets_fotos (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    ID_TICKET INT NOT NULL,
    FOTO1 LONGTEXT NULL,
    FOTO2 LONGTEXT NULL,
    FOTO3 LONGTEXT NULL,
    UNIQUE KEY uk_tickets_fotos_ticket (ID_TICKET),
    CONSTRAINT fk_tickets_fotos_ticket
      FOREIGN KEY (ID_TICKET) REFERENCES tickets(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

async function ensureTicketSchemaUpdates() {
  const columns = await query('SHOW COLUMNS FROM tickets');
  const byName = Object.fromEntries(columns.map((c) => [c.Field, c]));

  if (!byName.accesos) {
    await query('ALTER TABLE tickets ADD COLUMN accesos VARCHAR(255) NULL');
  }
  if (!byName.notas) {
    await query('ALTER TABLE tickets ADD COLUMN notas TEXT NULL');
  } else if (!String(byName.notas.Type).includes('text')) {
    await query('ALTER TABLE tickets MODIFY COLUMN notas TEXT NULL');
  }

  if (!byName.insumos) {
    await query('ALTER TABLE tickets ADD COLUMN insumos LONGTEXT NULL');
  }
  if (!byName.totalprecio) {
    await query('ALTER TABLE tickets ADD COLUMN totalprecio DECIMAL(12, 2) NULL');
  }
  if (!byName.prioridad) {
    await query(
      `ALTER TABLE tickets ADD COLUMN prioridad VARCHAR(10) NOT NULL DEFAULT 'MEDIA'`
    );
  }

  if (byName.codigo_empleado && byName.codigo_empleado.Null === 'NO') {
    try {
      await query('ALTER TABLE tickets DROP FOREIGN KEY fk_tickets_empleado');
    } catch (err) {
      if (err.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw err;
    }
    await query('ALTER TABLE tickets MODIFY COLUMN codigo_empleado INT NULL');
    await query(
      `ALTER TABLE tickets ADD CONSTRAINT fk_tickets_empleado
       FOREIGN KEY (codigo_empleado) REFERENCES empleados(codigo) ON DELETE RESTRICT`
    );
  }

  const fotoCols = columns.filter((c) => /^foto[123]$/.test(c.Field));
  for (const col of fotoCols) {
    if (col.Type.includes('longtext') || col.Type.includes('text')) {
      await query(`ALTER TABLE tickets MODIFY COLUMN ${col.Field} VARCHAR(255) NULL`);
    }
  }
}

async function ensureClienteSchemaUpdates() {
  const columns = await query('SHOW COLUMNS FROM clientes');
  const byName = Object.fromEntries(columns.map((c) => [c.Field, c]));
  if (!byName.telefono) {
    await query('ALTER TABLE clientes ADD COLUMN telefono VARCHAR(8) NULL');
  }
}

async function ensureTicketsFotosMigration() {
  const tables = await query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets_fotos'`
  );
  if (!tables.length) return;

  const legacyTickets = await query(
    `SELECT t.id, t.foto1, t.foto2, t.foto3
     FROM tickets t
     WHERE (t.foto1 IS NOT NULL OR t.foto2 IS NOT NULL OR t.foto3 IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM tickets_fotos tf WHERE tf.ID_TICKET = t.id)`
  );

  for (const ticket of legacyTickets) {
    await execute(
      `INSERT INTO tickets_fotos (ID_TICKET, FOTO1, FOTO2, FOTO3) VALUES (?, ?, ?, ?)`,
      [ticket.id, ticket.foto1, ticket.foto2, ticket.foto3]
    );
  }
}

async function dropLegacyTables() {
  await query('DROP TABLE IF EXISTS eventos');
  await query('DROP TABLE IF EXISTS cotizaciones');
}

async function initDb() {
  for (const sql of SCHEMA_STATEMENTS) {
    try {
      await query(sql);
    } catch (err) {
      if (err.code !== 'ER_DUP_KEYNAME') throw err;
    }
  }

  await dropLegacyTables();
  await ensureTicketSchemaUpdates();
  await ensureClienteSchemaUpdates();
  await ensureTicketsFotosMigration();

  const countRow = await queryOne('SELECT COUNT(*) AS total FROM empleados');
  if (Number(countRow.total) === 0) {
    await execute(
      `INSERT INTO empleados (nombre, telefono, tipo, estado, clave, color)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['Administrador', '00000000', 'SUPERVISOR', 'ACTIVO', 'ADMIN', '#7c3aed']
    );
  }
}

function getPool() {
  return pool;
}

module.exports = {
  query,
  queryOne,
  execute,
  initDb,
  getPool,
  toDateString,
};
