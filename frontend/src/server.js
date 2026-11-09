'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = Number.parseInt(process.env.FRONTEND_PORT || process.env.PORT || '8080', 10);
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:3000';
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Cabeceras de Seguridad HTTP en el Servidor de Front-End (OWASP ASVS v5.0 V14.4 Nivel 3)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"]
      }
    },
    frameguard: { action: 'deny' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' }
  })
);

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// Healthcheck del contenedor Front-End
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'pnk-carta-digital-frontend',
    urlObfuscation: 'enabled',
    status: 'healthy'
  });
});

// Bloquear acceso externo a endpoints internos del Backend (/api/internal/*) (ASVS v5.0 V4.1)
app.use('/api/internal', (req, res) => {
  res.status(403).json({ ok: false, error: { code: 'FORBIDDEN_INTERNAL_ROUTE', message: 'Ruta interna restringida.' } });
});

// Proxy reverso hacia el contenedor Back-End (/api -> BACKEND_URL/api)
app.use(
  '/api',
  createProxyMiddleware({
    target: BACKEND_URL,
    changeOrigin: true,
    xfwd: true,
    pathRewrite: (pathStr) => `/api${pathStr}`
  })
);

app.use(compression());

// Ofuscación de rutas de imágenes (/media/:restRef/:filename) para no exponer /imagenes/cod1/ (ASVS v5.0 V4.2.1 & V12)
app.get('/media/:restRef/:filename', async (req, res) => {
  try {
    const safeFilename = path.basename(String(req.params.filename || ''));
    if (!/^[a-zA-Z0-9._-]+$/.test(safeFilename)) {
      return res.status(400).end();
    }

    const resolveRes = await fetch(
      `${BACKEND_URL}/api/internal/media-resolve/${encodeURIComponent(req.params.restRef)}`
    );
    if (!resolveRes.ok) {
      return res.sendFile(path.join(publicDir, 'img', 'carta_comodin.png'));
    }
    const { data } = await resolveRes.json();
    const folder = path.basename(String(data?.folder || ''));
    const fullPath = path.join(publicDir, 'imagenes', folder, safeFilename);

    if (!fullPath.startsWith(path.join(publicDir, 'imagenes')) || !fs.existsSync(fullPath)) {
      return res.sendFile(path.join(publicDir, 'img', 'carta_comodin.png'));
    }
    return res.sendFile(fullPath);
  } catch {
    return res.sendFile(path.join(publicDir, 'img', 'carta_comodin.png'));
  }
});

// Bloquear acceso directo a /imagenes/cod* para evitar enumeración de IDs de restaurantes
app.use('/imagenes', (req, res) => {
  res.status(403).send('Acceso directo a directorios internos bloqueado por política de ofuscación ASVS v5.0.');
});

// Middleware de Limpieza y Ofuscación de URL:
// Si alguien ingresa con ?id=, ?keyid=, /index.php, /index.html, /mostrar_carrito.php o /mostrar_carrito.html,
// redirige inmediatamente (302) a la ruta limpia sin parámetros (/carta o /carrito)
app.get(['/', '/carta', '/c/:ref', '/index.html', '/index.php'], (req, res) => {
  if (
    req.query.id !== undefined ||
    req.query.keyid !== undefined ||
    req.path === '/index.html' ||
    req.path === '/index.php'
  ) {
    return res.redirect(302, '/carta');
  }
  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.get(['/carrito', '/mostrar_carrito.html', '/mostrar_carrito.php'], (req, res) => {
  if (
    req.query.id !== undefined ||
    req.query.keyid !== undefined ||
    req.path === '/mostrar_carrito.html' ||
    req.path === '/mostrar_carrito.php'
  ) {
    return res.redirect(302, '/carrito');
  }
  return res.sendFile(path.join(publicDir, 'mostrar_carrito.html'));
});

// Archivos estáticos públicos (CSS, iconos, módulos JS nativos)
app.use(
  express.static(publicDir, {
    etag: true,
    maxAge: '1h',
    dotfiles: 'deny',
    index: false
  })
);

app.use((req, res) => {
  res.status(404).send('Página no encontrada.');
});

app.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      event: 'FRONTEND_SERVER_STARTED',
      port: PORT,
      backendTarget: BACKEND_URL
    }) + '\n'
  );
});
