'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const env = require('./config/env');
const logger = require('./config/logger');
const { generateSecureToken } = require('./utils/cryptoUtils');
const { apiLimiter } = require('./middlewares/rateLimiter');
const apiRoutes = require('./routes/api.routes');
const JsonView = require('./views/JsonView');

const app = express();

// Confiar en primer proxy inverso (Cloudflare / Nginx Frontend) para obtener IP real y X-Forwarded-Proto
app.set('trust proxy', 1);
app.disable('x-powered-by');

// 1. Trazabilidad de petición (Correlation / Request ID - OWASP ASVS v5.0 V7)
app.use((req, res, next) => {
  const incomingId = req.headers['x-request-id'];
  const requestId = (typeof incomingId === 'string' && /^[a-zA-Z0-9-]{8,64}$/.test(incomingId))
    ? incomingId
    : generateSecureToken(16);
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

// 2. Cabeceras de Seguridad HTTP estrictas (OWASP ASVS v5.0 V14.4 Nivel 3)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"]
      }
    },
    frameguard: { action: 'deny' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' }
  })
);

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  next();
});

// 3. CORS estricto con credenciales
const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id', 'X-Carta-Ref']
  })
);

// 4. Rate Limiting global de API
app.use('/api', apiLimiter);

// 5. Parsers con límites estrictos de tamaño para mitigar ataques de denegación de servicio (ASVS v5.0 V12 / V13)
app.use(cookieParser());
app.use(express.json({ limit: '16kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 20 }));
app.use(compression());

// 6. Rutas de API
app.use('/api', apiRoutes);

// 7. Manejador 404 canónico
app.use((req, res) => {
  return JsonView.error(res, 'Recurso de API no encontrado.', 404, 'NOT_FOUND');
});

// 8. Manejador Global de Errores sin filtración de trazas internas (OWASP ASVS v5.0 V7.4)
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return JsonView.error(res, 'El tamaño de la petición excede el límite permitido (16KB).', 413, 'PAYLOAD_TOO_LARGE');
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return JsonView.error(res, 'Formato JSON inválido en el cuerpo de la petición.', 400, 'INVALID_JSON');
  }

  logger.error('UNHANDLED_API_ERROR', {
    requestId: res.locals.requestId,
    method: req.method,
    path: req.originalUrl,
    message: err.message
  });

  return JsonView.error(res, 'Ha ocurrido un error interno al procesar la solicitud.', 500, 'INTERNAL_ERROR');
});

module.exports = app;
