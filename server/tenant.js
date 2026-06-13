const { queryOne } = require('./db');
const { DEFAULT_EMPNIT } = require('./constants');

function getEmpnit(auth) {
  const empnit = String(auth?.empnit || '').trim();
  return empnit || null;
}

function empnitSql(alias = '') {
  const col = alias ? `${alias}.EMPNIT` : 'EMPNIT';
  return `${col} = ?`;
}

async function getFirstEmpresaEmpnit() {
  const row = await queryOne('SELECT EMPNIT FROM empresas ORDER BY EMPRESA, EMPNIT LIMIT 1');
  return row?.EMPNIT || DEFAULT_EMPNIT;
}

async function getEmpresaLabel(empnit) {
  const row = await queryOne('SELECT EMPRESA FROM empresas WHERE EMPNIT = ?', [empnit]);
  return row?.EMPRESA || empnit;
}

module.exports = {
  getEmpnit,
  empnitSql,
  getFirstEmpresaEmpnit,
  getEmpresaLabel,
};
