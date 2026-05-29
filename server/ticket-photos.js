const { query, queryOne, execute } = require('./db');
const { saveTicketPhoto } = require('./photos');

async function loadTicketPhotos(ticketId, legacyRow = null) {
  const row = await queryOne(
    'SELECT FOTO1, FOTO2, FOTO3 FROM tickets_fotos WHERE ID_TICKET = ?',
    [ticketId]
  );
  const result = {
    foto1: row?.FOTO1 || null,
    foto2: row?.FOTO2 || null,
    foto3: row?.FOTO3 || null,
  };
  if (legacyRow) {
    for (const slot of [1, 2, 3]) {
      const key = `foto${slot}`;
      if (!result[key] && legacyRow[key]) {
        result[key] = legacyRow[key];
      }
    }
  }
  return result;
}

function resolvePhotoFilename(input, ticketId, slot, existingFilename) {
  if (input == null || input === '') return null;
  if (
    typeof input === 'string' &&
    !input.startsWith('data:') &&
    existingFilename &&
    input === existingFilename
  ) {
    return existingFilename;
  }
  return saveTicketPhoto(input, ticketId, slot);
}

async function saveTicketPhotos(ticketId, inputs, existingPhotos = {}) {
  const hasInput =
    inputs.foto1 !== undefined || inputs.foto2 !== undefined || inputs.foto3 !== undefined;
  if (!hasInput) return;

  const foto1 =
    inputs.foto1 !== undefined
      ? resolvePhotoFilename(inputs.foto1, ticketId, 1, existingPhotos.foto1)
      : existingPhotos.foto1;
  const foto2 =
    inputs.foto2 !== undefined
      ? resolvePhotoFilename(inputs.foto2, ticketId, 2, existingPhotos.foto2)
      : existingPhotos.foto2;
  const foto3 =
    inputs.foto3 !== undefined
      ? resolvePhotoFilename(inputs.foto3, ticketId, 3, existingPhotos.foto3)
      : existingPhotos.foto3;

  const existing = await queryOne('SELECT ID FROM tickets_fotos WHERE ID_TICKET = ?', [ticketId]);
  if (existing) {
    await execute(
      'UPDATE tickets_fotos SET FOTO1 = ?, FOTO2 = ?, FOTO3 = ? WHERE ID_TICKET = ?',
      [foto1, foto2, foto3, ticketId]
    );
  } else if (foto1 || foto2 || foto3) {
    await execute(
      'INSERT INTO tickets_fotos (ID_TICKET, FOTO1, FOTO2, FOTO3) VALUES (?, ?, ?, ?)',
      [ticketId, foto1, foto2, foto3]
    );
  }
}

module.exports = {
  loadTicketPhotos,
  saveTicketPhotos,
};
