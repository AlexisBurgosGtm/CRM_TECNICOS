const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SOURCE = path.join(__dirname, '..', 'public', 'favicon.png');
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const ICON_SIZES = [16, 32, 48, 72, 96, 128, 144, 152, 167, 180, 192, 384, 512];
const MASKABLE_SIZES = [192, 512];
const MASKABLE_BG = { r: 255, g: 255, b: 255, alpha: 1 };

function buildSquareIcon(size, { maskable = false } = {}) {
  const scale = maskable ? 0.72 : 0.92;
  const inner = Math.max(1, Math.round(size * scale));
  const offset = Math.round((size - inner) / 2);
  const background = maskable ? MASKABLE_BG : { r: 0, g: 0, b: 0, alpha: 0 };

  return sharp(SOURCE)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
    .then((foreground) =>
      sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background,
        },
      })
        .composite([{ input: foreground, top: offset, left: offset }])
        .png()
    );
}

async function writeIcon(size, { maskable = false } = {}) {
  const suffix = maskable ? '-maskable' : '';
  const filename = `icon${suffix}-${size}.png`;
  const output = path.join(OUT_DIR, filename);
  const pipeline = await buildSquareIcon(size, { maskable });
  await pipeline.toFile(output);
  return filename;
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`No se encontró el icono de referencia: ${SOURCE}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const size of ICON_SIZES) {
    await writeIcon(size);
  }

  for (const size of MASKABLE_SIZES) {
    await writeIcon(size, { maskable: true });
  }

  await sharp(path.join(OUT_DIR, 'icon-180.png')).toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
  await sharp(path.join(OUT_DIR, 'icon-32.png')).toFile(path.join(PUBLIC_DIR, 'favicon-32.png'));
  await sharp(path.join(OUT_DIR, 'icon-16.png')).toFile(path.join(PUBLIC_DIR, 'favicon-16.png'));

  const manifestIcons = [
    ...ICON_SIZES.map((size) => ({
      src: `/icons/icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any',
    })),
    ...MASKABLE_SIZES.map((size) => ({
      src: `/icons/icon-maskable-${size}.png`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'maskable',
    })),
  ];

  const manifestPath = path.join(PUBLIC_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.icons = manifestIcons;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Iconos generados en ${OUT_DIR} (${ICON_SIZES.length + MASKABLE_SIZES.length} archivos)`);
  console.log('manifest.json actualizado con todos los tamaños');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
