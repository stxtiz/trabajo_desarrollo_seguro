'use strict';

const JsonView = require('../views/JsonView');
const { decodeRef } = require('../utils/cryptoUtils');

/**
 * Validación de Esquemas y Desofuscación Criptográfica de Referencias (OWASP ASVS v5.0 V4.2.1 & V5 Nivel 3)
 * - Prohíbe exponer IDs secuenciales (id=1, keyid=1) en las URLs
 * - Resuelve tokens opacos autenticados con AES-256-CTR + HMAC-SHA256
 */
function parsePositiveInt(val) {
  if (val === undefined || val === null || val === '') return null;
  const str = String(val).trim();
  if (!/^\d+$/.test(str)) return null;
  const num = Number.parseInt(str, 10);
  if (!Number.isSafeInteger(num) || num <= 0 || num > 2147483647) return null;
  return num;
}

/**
 * Resuelve el restaurante activo sin exponer ?id= ni ?keyid= en la URL:
 * 1. Si viene un token opaco (:ref o cabecera X-Carta-Ref), lo desencripta y verifica su HMAC.
 * 2. Si se intenta pasar un parámetro crudo o inválido (SQLi, ID plano no autorizado en ruta con :ref), devuelve 400.
 * 3. Si es la ruta limpia (/api/v1/carta), usa el restaurante asociado a la sesión del servidor (por defecto 1).
 */
function validateRestauranteRef(req, res, next) {
  // Rechazar explícitamente cualquier intento de usar ?id= o ?keyid= en la query string de la API
  if (req.query.id !== undefined || req.query.keyid !== undefined) {
    return JsonView.error(
      res,
      'El uso de parámetros id o keyid en la URL está bloqueado por política de ofuscación ASVS v5.0.',
      400,
      'RAW_ID_IN_URL_FORBIDDEN'
    );
  }

  const rawRef = req.params.ref || req.headers['x-carta-ref'] || req.body?.restauranteRef;
  if (rawRef !== undefined && rawRef !== null && rawRef !== '') {
    const decodedId = decodeRef('rest', String(rawRef));
    if (!decodedId) {
      return JsonView.error(res, 'Referencia opaca de restaurante inválida o manipulada.', 400, 'INVALID_OBFUSCATED_REF');
    }
    req.restauranteId = decodedId;
    return next();
  }

  req.restauranteId = parsePositiveInt(req.session?.restaurante_id) || 1;
  return next();
}

function resolveItemRef(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  return decodeRef('item', rawToken.trim());
}

function validateEmail(email) {
  if (typeof email !== 'string') return null;
  const clean = email.trim().normalize('NFC');
  if (clean.length < 5 || clean.length > 254) return null;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(clean) ? clean.toLowerCase() : null;
}

function validateComentarioText(text) {
  if (typeof text !== 'string') return null;
  const clean = text.normalize('NFC').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  if (clean.length < 1 || clean.length > 1000) return null;
  return clean;
}

module.exports = {
  parsePositiveInt,
  validateRestauranteRef,
  resolveItemRef,
  validateEmail,
  validateComentarioText
};
