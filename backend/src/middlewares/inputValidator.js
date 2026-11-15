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
 * Rechaza explícitamente cualquier intento de usar ?id= o ?keyid= en la query string de la API
 */
function rejectRawIdsInQuery(req, res, next) {
  if (req.query.id !== undefined || req.query.keyid !== undefined) {
    return JsonView.error(
      res,
      'El uso de parámetros id o keyid en la URL está bloqueado por política de ofuscación ASVS v5.0.',
      400,
      'RAW_ID_IN_URL_FORBIDDEN'
    );
  }
  return next();
}

/**
 * Resuelve el restaurante activo sin exponer ?id= ni ?keyid= en la URL:
 * 1. Si viene un token opaco (:ref o cabecera X-Carta-Ref), lo desencripta y verifica su HMAC.
 * 2. Si se intenta pasar un parámetro crudo o inválido (SQLi, ID plano no autorizado en ruta con :ref), devuelve 400.
 * 3. Si es la ruta limpia (/api/v1/carta), usa el restaurante asociado a la sesión del servidor (por defecto 1).
 */
function validateRestauranteRef(req, res, next) {
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
    req.explicitRestauranteRef = true;
    return next();
  }

  req.restauranteId = parsePositiveInt(req.session?.restaurante_id) || 1;
  req.explicitRestauranteRef = false;
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

function sanitizeText(val, { min = 0, max = 200, required = false } = {}) {
  if (val === undefined || val === null) {
    return required ? { ok: false, value: null } : { ok: true, value: null };
  }
  if (typeof val === 'object') {
    return { ok: false, value: null };
  }
  const clean = String(val)
    .normalize('NFC')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();

  if (clean.length === 0) {
    return required ? { ok: false, value: null } : { ok: true, value: null };
  }
  if (clean.length < min || clean.length > max) {
    return { ok: false, value: null };
  }
  return { ok: true, value: clean };
}

function validateComentarioText(text) {
  const res = sanitizeText(text, { min: 1, max: 1000, required: true });
  return res.ok ? res.value : null;
}

function validateRut(rut) {
  const res = sanitizeText(rut, { min: 3, max: 15, required: true });
  if (!res.ok) return null;
  return /^[0-9.]{1,12}-[0-9kK]$/.test(res.value) ? res.value : null;
}

function validateIntRange(val, { min = 0, max = 2147483647, allowNull = false, defaultValue = null } = {}) {
  if (val === undefined || val === null || val === '') {
    return allowNull ? { ok: true, value: defaultValue } : { ok: false, value: null };
  }
  if (typeof val === 'boolean' || typeof val === 'object') {
    return { ok: false, value: null };
  }
  const str = String(val).trim();
  if (!/^-?\d+$/.test(str)) {
    return { ok: false, value: null };
  }
  const num = Number.parseInt(str, 10);
  if (!Number.isSafeInteger(num) || num < min || num > max) {
    return { ok: false, value: null };
  }
  return { ok: true, value: num };
}

function validateBoolean(val, defaultValue = false) {
  if (val === undefined || val === null) return defaultValue;
  if (typeof val === 'boolean') return val;
  if (val === 1 || val === '1' || val === 'true') return true;
  if (val === 0 || val === '0' || val === 'false') return false;
  return defaultValue;
}

function validateSafeFilename(val) {
  if (val === undefined || val === null) {
    return { ok: true, value: null };
  }
  if (typeof val !== 'string') {
    return { ok: false, value: null };
  }
  const clean = val.trim();
  if (clean === '') {
    return { ok: true, value: null };
  }
  if (clean.length > 200 || clean.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(clean)) {
    return { ok: false, value: null };
  }
  return { ok: true, value: clean };
}

function hasValidImageMagicBytes(mimeSubtype, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mimeSubtype === 'png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeSubtype === 'jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeSubtype === 'webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

function validateFotoData(val) {
  if (val === undefined) {
    return { ok: true, provided: false, value: undefined };
  }
  if (val === null || val === '') {
    return { ok: true, provided: true, value: null };
  }
  if (typeof val !== 'string') {
    return { ok: false, provided: true, value: null };
  }
  const clean = val.trim();
  if (clean.length > 350000) {
    return { ok: false, provided: true, value: null };
  }
  const match = clean.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) {
    return { ok: false, provided: true, value: null };
  }
  const mimeSubtype = match[1];
  const base64Body = match[2];
  if (base64Body.length % 4 !== 0) {
    return { ok: false, provided: true, value: null };
  }
  const decoded = Buffer.from(base64Body, 'base64');
  if (!hasValidImageMagicBytes(mimeSubtype, decoded)) {
    return { ok: false, provided: true, value: null };
  }
  return { ok: true, provided: true, value: clean };
}

function validateRolUsuario(val) {
  if (typeof val !== 'string') return null;
  const clean = val.trim().toLowerCase();
  return (clean === 'admin' || clean === 'user') ? clean : null;
}

function validateEstadoUsuario(val) {
  if (val === '1' || val === 1 || val === true || val === 'true') return '1';
  if (val === '0' || val === 0 || val === false || val === 'false') return '0';
  return null;
}

function validatePassword(val, { required = true } = {}) {
  if (val === undefined || val === null || val === '') {
    return required ? { ok: false, provided: false, value: null } : { ok: true, provided: false, value: null };
  }
  if (typeof val !== 'string') {
    return { ok: false, provided: true, value: null };
  }
  if (val.length < 8 || val.length > 128) {
    return { ok: false, provided: true, value: null };
  }
  return { ok: true, provided: true, value: val };
}

module.exports = {
  parsePositiveInt,
  rejectRawIdsInQuery,
  validateRestauranteRef,
  resolveItemRef,
  validateEmail,
  sanitizeText,
  validateComentarioText,
  validateRut,
  validateIntRange,
  validateBoolean,
  validateSafeFilename,
  validateFotoData,
  validateRolUsuario,
  validateEstadoUsuario,
  validatePassword
};
