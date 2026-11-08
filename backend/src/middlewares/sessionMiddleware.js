'use strict';

const env = require('../config/env');
const SesionModel = require('../models/SesionModel');
const { safeCompare } = require('../utils/cryptoUtils');
const JsonView = require('../views/JsonView');
const AuditoriaModel = require('../models/AuditoriaModel');

function setSessionCookie(res, sid, req) {
  const isSecure = env.ENFORCE_HTTPS || req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(env.SESSION_COOKIE_NAME, sid, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: env.SESSION_ABSOLUTE_TIMEOUT_SEC * 1000
  });
}

function clearSessionCookie(res, req) {
  const isSecure = env.ENFORCE_HTTPS || req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/'
  });
}

/**
 * Middleware de Sesión Server-Side en PostgreSQL (OWASP ASVS v5.0 Nivel 3 V3)
 */
async function sessionMiddleware(req, res, next) {
  try {
    const sid = req.cookies?.[env.SESSION_COOKIE_NAME] || null;
    let sesion = null;

    if (sid) {
      sesion = await SesionModel.obtenerValida(sid);
    }

    if (!sesion) {
      sesion = await SesionModel.crear({
        ipAddress: req.ip || '0.0.0.0',
        userAgent: req.headers['user-agent'] || ''
      });
      setSessionCookie(res, sesion.sid, req);
    }

    req.session = sesion;
    res.locals.csrfToken = sesion.csrf_token;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Middleware de Protección CSRF (Synchronizer Token Pattern en tiempo constante - OWASP ASVS v5.0 V4.2.2)
 */
async function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const headerToken = req.headers['x-csrf-token'];
  const bodyToken = req.body?.csrf_token;
  const candidateToken = String(headerToken || bodyToken || '');
  const expectedToken = String(req.session?.csrf_token || '');

  if (!candidateToken || !expectedToken || !safeCompare(candidateToken, expectedToken)) {
    await AuditoriaModel.registrar({
      evento: 'CSRF_VALIDATION_FAILED',
      severidad: 'WARN',
      usuarioId: req.session?.usuario_id || null,
      ipAddress: req.ip || '0.0.0.0',
      requestId: res.locals.requestId,
      detalles: { path: req.originalUrl, method: req.method }
    });
    return JsonView.error(res, 'CSRF token validation failed', 403, 'CSRF_INVALID');
  }

  return next();
}

/**
 * Middleware de Autenticación Requerida (OWASP ASVS v5.0 V4.1)
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.usuario_id || !req.session.nombre_usuario) {
    return JsonView.error(res, 'Debe iniciar sesión para realizar esta acción.', 403, 'AUTH_REQUIRED');
  }
  return next();
}

module.exports = {
  sessionMiddleware,
  verifyCsrf,
  requireAuth,
  setSessionCookie,
  clearSessionCookie
};
