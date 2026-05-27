const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'calendario.db');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

function columnExists(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS empleados (
    codigo INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clientes (
    codigo INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_empresa TEXT NOT NULL,
    nombre_cliente TEXT NOT NULL,
    direccion TEXT NOT NULL,
    latitud REAL,
    longitud REAL
  );

  CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    inicio TEXT NOT NULL,
    fin TEXT NOT NULL,
    empleado_codigo INTEGER NOT NULL,
    FOREIGN KEY (empleado_codigo) REFERENCES empleados(codigo) ON DELETE RESTRICT
  );
`);

if (!columnExists('eventos', 'observaciones')) {
  db.exec('ALTER TABLE eventos ADD COLUMN observaciones TEXT');
}
if (!columnExists('eventos', 'cliente_codigo')) {
  db.exec('ALTER TABLE eventos ADD COLUMN cliente_codigo INTEGER');
}
if (!columnExists('eventos', 'estatus')) {
  db.exec("ALTER TABLE eventos ADD COLUMN estatus TEXT NOT NULL DEFAULT 'pendiente'");
}
if (!columnExists('eventos', 'totalprecio')) {
  db.exec('ALTER TABLE eventos ADD COLUMN totalprecio REAL');
}
if (!columnExists('eventos', 'cotizado')) {
  db.exec('ALTER TABLE eventos ADD COLUMN cotizado REAL');
}

if (!columnExists('empleados', 'tipo')) {
  db.exec("ALTER TABLE empleados ADD COLUMN tipo TEXT NOT NULL DEFAULT 'TECNICO'");
}
if (!columnExists('empleados', 'estado')) {
  db.exec("ALTER TABLE empleados ADD COLUMN estado TEXT NOT NULL DEFAULT 'ACTIVO'");
}
if (!columnExists('empleados', 'clave')) {
  db.exec("ALTER TABLE empleados ADD COLUMN clave TEXT NOT NULL DEFAULT '1234'");
}
if (!columnExists('empleados', 'color')) {
  db.exec("ALTER TABLE empleados ADD COLUMN color TEXT NOT NULL DEFAULT '#7c3aed'");
}

db.exec(`DROP TABLE IF EXISTS usuarios`);

const empleadoCount = db.prepare('SELECT COUNT(*) AS total FROM empleados').get().total;
if (empleadoCount === 0) {
  db.prepare(
    `INSERT INTO empleados (nombre, telefono, tipo, estado, clave, color)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run('Administrador', '00000000', 'SUPERVISOR', 'ACTIVO', 'ADMIN', '#7c3aed');
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_eventos_empleado ON eventos(empleado_codigo);
  CREATE INDEX IF NOT EXISTS idx_eventos_cliente ON eventos(cliente_codigo);
  CREATE INDEX IF NOT EXISTS idx_eventos_inicio ON eventos(inicio);
  CREATE INDEX IF NOT EXISTS idx_eventos_estatus ON eventos(estatus);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS cotizaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    cliente TEXT NOT NULL,
    telefono TEXT NOT NULL,
    vence TEXT NOT NULL,
    totalprecio REAL,
    detalles TEXT,
    status TEXT NOT NULL DEFAULT 'PENDIENTE'
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha ON cotizaciones(fecha);
  CREATE INDEX IF NOT EXISTS idx_cotizaciones_status ON cotizaciones(status);
`);

module.exports = db;
