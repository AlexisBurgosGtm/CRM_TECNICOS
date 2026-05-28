let xlsxModule = null;

async function loadXlsx() {
  if (!xlsxModule) {
    xlsxModule = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
  }
  return xlsxModule;
}

/**
 * @param {Array<Array<string|number>>} rows First row = headers
 * @param {string} sheetName
 * @param {string} filename
 */
export async function exportRowsToExcel(rows, sheetName, filename) {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
