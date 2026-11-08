'use strict';

require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const env = Object.freeze({
  NODE_ENV,
  IS_PROD,
  PORT: Number.parseInt(process.env.BACKEND_PORT || process.env.PORT || '3000', 10),
  PG_HOST: process.env.POSTGRES_HOST || 'db',
  PG_PORT: Number.parseInt(process.env.POSTGRES_PORT || '5432', 10),
  PG_DATABASE: process.env.POSTGRES_DB || 'pnk_security',
  PG_USER: process.env.POSTGRES_USER || 'pnk_user',
  PG_PASSWORD: process.env.POSTGRES_PASSWORD || '',
  PG_SSL: process.env.POSTGRES_SSL === 'true',
  SESSION_COOKIE_NAME: IS_PROD ? '__Host-pnk_sid' : 'pnk_sid',
  SESSION_IDLE_TIMEOUT_SEC: Number.parseInt(process.env.SESSION_IDLE_TIMEOUT_SEC || '900', 10), // 15 min (ASVS v5.0 L3 V3.3)
  SESSION_ABSOLUTE_TIMEOUT_SEC: Number.parseInt(process.env.SESSION_ABSOLUTE_TIMEOUT_SEC || '14400', 10), // 4 horas (ASVS v5.0 L3 V3.3)
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:8080',
  ENFORCE_HTTPS: process.env.ENFORCE_HTTPS === '1' || IS_PROD,
  PASSWORD_PEPPER: process.env.PASSWORD_PEPPER || 'pnk-asvs5-l3-default-dev-pepper-change-in-prod'
});

if (IS_PROD && (!env.PG_PASSWORD || env.PASSWORD_PEPPER.includes('default-dev-pepper'))) {
  throw new Error('[FATAL_CONFIG] En producción (ASVS v5.0 Nivel 3) es obligatorio definir POSTGRES_PASSWORD y PASSWORD_PEPPER seguros.');
}

module.exports = env;
