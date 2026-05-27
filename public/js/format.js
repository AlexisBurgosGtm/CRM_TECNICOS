export function formatDate(value) {
  if (value === null || value === undefined || value === '') return '—';

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value) {
  if (value === null || value === undefined || value === '') return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} ${h}:${min}`;
}

export function formatImporte(value) {
  const n = value == null || Number.isNaN(Number(value)) ? 0 : Number(value);
  return `Q ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
