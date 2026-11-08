'use strict';

/**
 * Logger estructurado JSON conforme a OWASP ASVS v5.0 V7 (Error Handling and Logging)
 * - Previene Log Injection (eliminación de CR/LF y caracteres de control)
 * - Enmascara credenciales, contraseñas y tokens de sesión
 */
const SENSITIVE_KEYS = new Set(['password', 'frmpassword', 'csrf_token', 'token', 'sid', 'cookie', 'authorization']);

function sanitizeString(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/[\r\n\t\x00-\x1F\x7F]/g, ' ').slice(0, 1024);
}

function redactObject(obj) {
  if (!obj || typeof obj !== 'object') return sanitizeString(obj);
  const clean = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      clean[k] = '[REDACTED_ASVS5]';
    } else if (v && typeof v === 'object') {
      clean[k] = redactObject(v);
    } else {
      clean[k] = sanitizeString(v);
    }
  }
  return clean;
}

function writeLog(level, event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event: sanitizeString(event),
    ...redactObject(details)
  };
  const line = JSON.stringify(entry);
  if (level === 'ERROR' || level === 'CRITICAL' || level === 'SECURITY') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

module.exports = {
  info: (event, details) => writeLog('INFO', event, details),
  warn: (event, details) => writeLog('WARN', event, details),
  security: (event, details) => writeLog('SECURITY', event, details),
  error: (event, details) => writeLog('ERROR', event, details)
};
