# Calendario de eventos (SPA + PWA)

Aplicación **Single Page Application** con Node.js, Express, SQLite, Service Worker y SweetAlert2.

## Características

- SPA con contenedor `#root` en `index.html`
- Rutas hash: `#/login`, `#/calendario`, `#/empleados`, `#/clientes`
- PWA con `manifest.json` y Service Worker (actualización automática de caché)
- API **solo POST** hacia `/api/*` (consultas y mutaciones a SQLite)
- Login fijo: usuario `ADMIN`, clave `ADMIN`
- Botón **Salir** en la pantalla de calendario

## Instalación

```bash
npm install
node scripts/generate-icons.js
npm start
```

Abrir: [http://localhost:3000](http://localhost:3000)

## API (POST)

| Ruta | Descripción |
|------|-------------|
| `POST /api/auth/login` | `{ usuario, clave }` |
| `POST /api/auth/logout` | Requiere Bearer token |
| `POST /api/empleados/list` | Listar empleados |
| `POST /api/empleados/create` | Crear |
| `POST /api/empleados/update` | `{ codigo, ... }` |
| `POST /api/empleados/delete` | `{ codigo }` |
| `POST /api/clientes/list` | Listar clientes |
| `POST /api/clientes/create` | Crear |
| `POST /api/clientes/update` | `{ codigo, ... }` |
| `POST /api/clientes/delete` | `{ codigo }` |
| `POST /api/eventos/list` | `{ start, end }` |
| `POST /api/eventos/create` | Crear evento |
| `POST /api/eventos/update` | `{ id, ... }` |
| `POST /api/eventos/delete` | `{ id }` |

Todas las rutas (excepto login) requieren cabecera `Authorization: Bearer <token>`.

## PWA

El Service Worker usa estrategia **network-first** y renueva la caché cuando cambia `/cache-version.json` (generado al iniciar el servidor).
