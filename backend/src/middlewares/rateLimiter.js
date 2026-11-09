'use strict';

const rateLimit = require('express-rate-limit');
const JsonView = require('../views/JsonView');
const AuditoriaModel = require('../models/AuditoriaModel');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_MAP_ENTRIES = 5000;

/**
 * Rate Limiter general para la API (OWASP ASVS v5.0 V13.1 / V11.1)
 */
const apiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return JsonView.error(res, 'Demasiadas solicitudes desde esta IP. Intente nuevamente más tarde.', 429, 'RATE_LIMIT_EXCEEDED');
  }
});

/**
 * Rate Limiter estricto para Autenticación (OWASP ASVS v5.0 V2.2.1 Anti-Brute Force & Anti-Password Spraying)
 * - Máximo 5 intentos fallidos cada 15 minutos por combinación IP + correo
 * - Máximo 20 intentos fallidos cada 15 minutos por IP global (protección contra Password Spraying)
 */
const loginAttemptsMap = new Map();
const ipSprayMap = new Map();

function pruneExpiredMap(map, now) {
  if (map.size < MAX_MAP_ENTRIES) return;
  for (const [k, v] of map.entries()) {
    if (now - v.firstAttempt >= WINDOW_MS) {
      map.delete(k);
    }
  }
  if (map.size >= MAX_MAP_ENTRIES) {
    const firstKey = map.keys().next().value;
    if (firstKey) map.delete(firstKey);
  }
}

function checkLoginRateLimit(req, res, next) {
  const email = String(req.body?.email || req.body?.frmusuario || '').trim().toLowerCase();
  const ip = req.ip || '0.0.0.0';
  const key = `${ip}|${email}`;
  const now = Date.now();

  const ipEntry = ipSprayMap.get(ip);
  if (ipEntry) {
    if (now - ipEntry.firstAttempt < WINDOW_MS) {
      if (ipEntry.attempts >= 20) {
        AuditoriaModel.registrar({
          evento: 'AUTH_IP_PASSWORD_SPRAY_LOCKOUT',
          severidad: 'WARN',
          ipAddress: ip,
          requestId: res.locals.requestId,
          detalles: { email }
        });
        return JsonView.error(res, 'Demasiados intentos fallidos. Intente nuevamente más tarde.', 429, 'AUTH_LOCKOUT');
      }
    } else {
      ipSprayMap.delete(ip);
    }
  }

  const entry = loginAttemptsMap.get(key);
  if (entry) {
    if (now - entry.firstAttempt < WINDOW_MS) {
      if (entry.attempts >= 5) {
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
  pruneExpiredMap(loginAttemptsMap, now);
  pruneExpiredMap(ipSprayMap, now);

  const existing = loginAttemptsMap.get(key);
  if (!existing || (now - existing.firstAttempt) >= WINDOW_MS) {
    loginAttemptsMap.set(key, { attempts: 1, firstAttempt: now });
  } else {
    existing.attempts += 1;
    loginAttemptsMap.set(key, existing);
  }

  const existingIp = ipSprayMap.get(ip);
  if (!existingIp || (now - existingIp.firstAttempt) >= WINDOW_MS) {
    ipSprayMap.set(ip, { attempts: 1, firstAttempt: now });
  } else {
    existingIp.attempts += 1;
    ipSprayMap.set(ip, existingIp);
  }
}

module.exports = {
  apiLimiter,
  checkLoginRateLimit,
  recordLoginAttempt
};
