const { queryOne } = require('./db');

async function verifyEmpresaClave(empnit, clave) {
  const nit = String(empnit || '').trim();
  if (!nit) return 'Sesión sin empresa asignada.';

  const row = await queryOne('SELECT CLAVE FROM empresas WHERE EMPNIT = ?', [nit]);
  if (!row) return 'Empresa no encontrada.';

  const stored = String(row.CLAVE || '').trim();
  if (!stored) {
    return 'No hay clave de eliminación configurada. Defínala en Config.';
  }

  const provided = String(clave || '').trim();
  if (!provided) return 'La clave de eliminación es obligatoria.';
  if (provided !== stored) return 'Clave de eliminación incorrecta.';

  return null;
}

async function empresaClaveConfigurada(empnit) {
  const row = await queryOne('SELECT CLAVE FROM empresas WHERE EMPNIT = ?', [String(empnit || '').trim()]);
  return Boolean(String(row?.CLAVE || '').trim());
}

module.exports = {
  verifyEmpresaClave,
  empresaClaveConfigurada,
};
