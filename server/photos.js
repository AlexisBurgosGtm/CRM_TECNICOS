const fs = require('fs');
const path = require('path');

const FOTOS_DIR = path.join(__dirname, '..', 'FOTOS');

function ensureFotosDir() {
  if (!fs.existsSync(FOTOS_DIR)) {
    fs.mkdirSync(FOTOS_DIR, { recursive: true });
  }
}

function sanitizeFilename(name) {
  return path.basename(String(name || 'foto.jpg')).replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getExtension(name, mime) {
  const ext = path.extname(sanitizeFilename(name));
  if (ext) return ext.toLowerCase();
  if (mime && mime.includes('png')) return '.png';
  if (mime && mime.includes('webp')) return '.webp';
  if (mime && mime.includes('gif')) return '.gif';
  return '.jpg';
}

function saveTicketPhoto(photoInput, ticketId, slot) {
  if (photoInput == null || photoInput === '') return null;

  if (typeof photoInput === 'string' && !photoInput.startsWith('data:')) {
    return sanitizeFilename(photoInput);
  }

  ensureFotosDir();

  let originalName = `foto${slot}.jpg`;
  let dataUrl = photoInput;

  if (typeof photoInput === 'object' && photoInput !== null) {
    originalName = photoInput.name || originalName;
    dataUrl = photoInput.data || photoInput.dataUrl || '';
  }

  if (!dataUrl || typeof dataUrl !== 'string') return null;

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mime = match ? match[1] : 'image/jpeg';
  const base64 = match ? match[2] : dataUrl;
  const ext = getExtension(originalName, mime);
  const storedName = `ticket_${ticketId}_${slot}_${Date.now()}${ext}`;

  fs.writeFileSync(path.join(FOTOS_DIR, storedName), Buffer.from(base64, 'base64'));
  return storedName;
}

function getFotosDir() {
  ensureFotosDir();
  return FOTOS_DIR;
}

function deletePhotoFile(filename) {
  if (!filename) return false;
  ensureFotosDir();
  const safe = sanitizeFilename(filename);
  const filePath = path.join(FOTOS_DIR, safe);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

module.exports = {
  ensureFotosDir,
  saveTicketPhoto,
  deletePhotoFile,
  getFotosDir,
};
