const path = require('path');
const express = require('express');

require('./server/db');

const apiRouter = require('./server/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

const cacheVersion = String(Date.now());

app.use(express.json());

app.get('/cache-version.json', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ version: cacheVersion });
});

app.use('/api', apiRouter);

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

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
