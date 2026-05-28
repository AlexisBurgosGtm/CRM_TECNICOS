const path = require('path');
const express = require('express');
const { initDb } = require('./server/db');
const { bumpBuildCounter, getBuildCounter } = require('./server/buildCounter');
const { ensureFotosDir } = require('./server/photos');

const apiRouter = require('./server/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const fotosDir = path.join(__dirname, 'FOTOS');

const cacheVersion = String(Date.now());

ensureFotosDir();
app.use(express.json({ limit: '15mb' }));

app.get('/cache-version.json', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ version: cacheVersion });
});

app.get('/build-counter.json', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ build: getBuildCounter() });
});

app.use('/api', apiRouter);

app.use('/FOTOS', express.static(fotosDir));

app.use(
  express.static(publicDir, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  })
);

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

async function start() {
  bumpBuildCounter();
  await initDb();
  app.listen(PORT, () => {
    console.log(`Servidor en http://localhost:${PORT} (build ${getBuildCounter()})`);
  });
}

start().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err.message);
  process.exit(1);
});
