'use strict';

const crypto = require('crypto');
const env = require('../config/env');

let argon2 = null;
try {
  argon2 = require('argon2');
} catch {
  argon2 = null;
}

/**
 * Genera un token aleatorio criptográficamente seguro de 256 bits (32 bytes = 64 hex chars)
 * Cumple OWASP ASVS v5.0 V3.2 & V6.3
 */
function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Comparación en tiempo constante para evitar ataques de temporización (Timing Attacks - ASVS v5.0 V2.2 / V6)
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Ofuscación Criptográfica Autenticada (AES-256-CTR + HMAC-SHA256 truncado, Base64URL)
 * Evita exponer IDs secuenciales de base de datos (id=1, keyid=1, etc.) en URLs, DOM y API (Anti-IDOR OWASP ASVS v5.0 V4.2.1)
 */
function getObfuscationKey() {
  return crypto.createHash('sha256').update(`pnk-asvs5-url-obfuscator:${env.PASSWORD_PEPPER}`).digest();
}

function obfuscateId(scope, numericId) {
  const idNum = Number.parseInt(String(numericId), 10);
  if (!Number.isSafeInteger(idNum) || idNum <= 0) return '';
  const key = getObfuscationKey();
  const payload = `${scope}:${idNum}`;
  // IV determinista derivado por HMAC para que el mismo recurso tenga un token opaco consistente sin revelar el entero
  const iv = crypto.createHmac('sha256', key).update(`iv:${payload}`).digest().subarray(0, 16);
  const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = crypto.createHmac('sha256', key).update(Buffer.concat([iv, encrypted])).digest().subarray(0, 8);
  return Buffer.concat([iv.subarray(0, 8), encrypted, tag]).toString('base64url');
}

function deobfuscateId(scope, token) {
  if (!token || typeof token !== 'string') return null;
  // Rechazar enteros crudos cuando se exige token ofuscado o intentar decodificar Base64URL
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < 18) return null;
    const key = getObfuscationKey();
    // Verificación por búsqueda rápida de IDs válidos (1..10000) o desencriptación directa
    // Como usamos primeros 8 bytes del IV determinista, reconstruimos o validamos por tabla/rango:
    // Para desencriptación directa en O(1) usamos IV de 16 bytes derivado de los primeros 8 bytes repetidos:
    return null;
  } catch {
    return null;
  }
}

/**
 * Versión O(1) reversible con AES-256-GCM / CTR + HMAC (IV de 12 bytes + ciphertext + 8 bytes HMAC)
 */
function encodeRef(scope, numericId) {
  const idNum = Number.parseInt(String(numericId), 10);
  if (!Number.isSafeInteger(idNum) || idNum <= 0) return '';
  const key = getObfuscationKey();
  const payload = `${scope}:${idNum}`;
  const iv16 = crypto.createHmac('sha256', key).update(`iv16:${payload}`).digest().subarray(0, 16);
  const cipher = crypto.createCipheriv('aes-256-ctr', key, iv16);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const mac = crypto.createHmac('sha256', key).update(Buffer.concat([iv16, encrypted])).digest().subarray(0, 10);
  return Buffer.concat([iv16, encrypted, mac]).toString('base64url');
}

function decodeRef(scope, token) {
  if (!token || typeof token !== 'string' || token.length < 24 || token.length > 128) {
    return null;
  }
  try {
    const buf = Buffer.from(token, 'base64url');
    if (buf.length < 28) return null;
    const iv16 = buf.subarray(0, 16);
    const mac = buf.subarray(buf.length - 10);
    const encrypted = buf.subarray(16, buf.length - 10);

    const key = getObfuscationKey();
    const expectedMac = crypto.createHmac('sha256', key).update(Buffer.concat([iv16, encrypted])).digest().subarray(0, 10);
    if (!crypto.timingSafeEqual(mac, expectedMac)) {
      return null;
    }

    const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv16);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    const [decScope, decIdStr] = decrypted.split(':');
    if (decScope !== scope) return null;
    const idNum = Number.parseInt(decIdStr, 10);
    if (!Number.isSafeInteger(idNum) || idNum <= 0) return null;
    return idNum;
  } catch {
    return null;
  }
}

/**
 * Hashea una contraseña usando Argon2id (primario ASVS v5.0 V2.4) o PBKDF2-HMAC-SHA512 (310,000 iteraciones)
 */
async function hashPassword(plainPassword) {
  const normalized = String(plainPassword).normalize('NFKC');
  if (argon2) {
    return argon2.hash(normalized, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 310000;
  const derived = crypto.pbkdf2Sync(normalized, salt, iterations, 64, 'sha512').toString('hex');
  return `$pbkdf2-sha512$${iterations}$${salt}$${derived}`;
}

/**
 * Verifica una contraseña contra hashes Argon2id o PBKDF2-HMAC-SHA512 en tiempo constante.
 */
async function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash || typeof storedHash !== 'string') {
    return { valid: false, needsRehash: false };
  }
  const normalized = String(plainPassword).normalize('NFKC');

  if (storedHash.startsWith('$argon2')) {
    if (!argon2) return { valid: false, needsRehash: false };
    try {
      const valid = await argon2.verify(storedHash, normalized);
      return { valid, needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  if (storedHash.startsWith('$pbkdf2-sha512$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 5) return { valid: false, needsRehash: false };
    const iterations = Number.parseInt(parts[2], 10);
    const salt = parts[3];
    const expectedHex = parts[4];
    if (!iterations || !salt || !expectedHex) return { valid: false, needsRehash: false };

    const derivedHex = crypto.pbkdf2Sync(normalized, salt, iterations, 64, 'sha512').toString('hex');
    const valid = safeCompare(derivedHex, expectedHex);
    return { valid, needsRehash: Boolean(valid && argon2) };
  }

  return { valid: false, needsRehash: false };
}

module.exports = {
  generateSecureToken,
  safeCompare,
  encodeRef,
  decodeRef,
  obfuscateId: encodeRef,
  deobfuscateId: decodeRef,
  hashPassword,
  verifyPassword
};
