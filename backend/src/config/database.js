'use strict';

const fs = require('fs');
const { Pool } = require('pg');
const env = require('./env');
const logger = require('./logger');

function buildSslConfig() {
  if (!env.PG_SSL) {
    return false;
  }

  const sslConfig = { rejectUnauthorized: true };
  if (env.PG_SSL_CA) {
    sslConfig.ca = fs.readFileSync(env.PG_SSL_CA, 'utf8');
  }
  return sslConfig;
}

const pool = new Pool({
  host: env.PG_HOST,
  port: env.PG_PORT,
  database: env.PG_DATABASE,
  user: env.PG_USER,
  password: env.PG_PASSWORD,
  ssl: buildSslConfig(),
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000 // ASVS v5.0 V12: Previene agotamiento de recursos por consultas lentas
});

pool.on('error', (err) => {
  logger.error('DB_POOL_UNEXPECTED_ERROR', { message: err.message });
});

/**
 * Ejecuta una consulta SQL parametrizada ($1, $2, ...)
 */
async function query(text, params = []) {
  return pool.query(text, params);
}

let schemaReadyPromise = null;

/**
 * Migración idempotente al arranque para actualizar volúmenes PostgreSQL existentes sin pérdida de datos
 */
async function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const statements = [
        `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'user'`,
        `UPDATE usuarios SET rol = 'admin' WHERE LOWER(email) = 'admin@gmail.com' AND rol <> 'admin'`,
        `ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS foto_data TEXT DEFAULT NULL`,
        `ALTER TABLE cartas ADD COLUMN IF NOT EXISTS foto_data TEXT DEFAULT NULL`,
        `ALTER TABLE categorias ADD COLUMN IF NOT EXISTS foto_data TEXT DEFAULT NULL`,
        `ALTER TABLE items ADD COLUMN IF NOT EXISTS foto_data TEXT DEFAULT NULL`
      ];
      for (const sql of statements) {
        await pool.query(sql);
      }
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

/**
 * Ejecuta una función dentro de una transacción PostgreSQL (BEGIN / COMMIT / ROLLBACK)
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function checkHealth() {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0]?.ok === 1;
}

module.exports = {
  pool,
  query,
  withTransaction,
  ensureSchema,
  checkHealth
};
