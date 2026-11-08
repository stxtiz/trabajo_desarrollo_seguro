'use strict';

const rateLimit = require('express-rate-limit');
const JsonView = require('../views/JsonView');
const AuditoriaModel = require('../models/AuditoriaModel');

/**
 * Rate Limiter general para la API (OWASP ASVS v5.0 V13.1 / V11.1)
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return JsonView.error(res, 'Demasiadas solicitudes desde esta IP. Intente nuevamente más tarde.', 429, 'RATE_LIMIT_EXCEEDED');
  }
});

/**
 * Rate Limiter estricto para Autenticación (OWASP ASVS v5.0 V2.2.1 Anti-Brute Force)
 * Máximo 5 intentos fallidos cada 15 minutos por combinación IP + correo
 */
const loginAttemptsMap = new Map();

function checkLoginRateLimit(req, res, next) {
  const email = String(req.body?.email || req.body?.frmusuario || '').trim().toLowerCase();
  const ip = req.ip || '0.0.0.0';
  const key = `${ip}|${email}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 5;

  const entry = loginAttemptsMap.get(key);
  if (entry) {
    if (now - entry.firstAttempt < windowMs) {
      if (entry.attempts >= maxAttempts) {
        AuditoriaModel.registrar({
          evento: 'AUTH_RATE_LIMIT_LOCKOUT',
          severidad: 'WARN',
          ipAddress: ip,
          requestId: res.locals.requestId,
          detalles: { email }
        });
        return JsonView.error(res, 'Demasiados intentos fallidos. Intente nuevamente más tarde.', 429, 'AUTH_LOCKOUT');
      }
    } else {
      loginAttemptsMap.delete(key);
    }
  }
  return next();
}

function recordLoginAttempt(ip, email, success) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const key = `${ip}|${normalizedEmail}`;
  if (success) {
    loginAttemptsMap.delete(key);
    return;
  }
  const now = Date.now();
  const existing = loginAttemptsMap.get(key);
  if (!existing || (now - existing.firstAttempt) >= 15 * 60 * 1000) {
    loginAttemptsMap.set(key, { attempts: 1, firstAttempt: now });
  } else {
    existing.attempts += 1;
    loginAttemptsMap.set(key, existing);
  }
}

module.exports = {
  apiLimiter,
  checkLoginRateLimit,
  recordLoginAttempt
};
