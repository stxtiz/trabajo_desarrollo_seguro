'use strict';

const { Pool } = require('pg');
const env = require('./env');
const logger = require('./logger');

const pool = new Pool({
  host: env.PG_HOST,
  port: env.PG_PORT,
  database: env.PG_DATABASE,
  user: env.PG_USER,
  password: env.PG_PASSWORD,
  ssl: env.PG_SSL ? { rejectUnauthorized: true } : false,
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

async function checkHealth() {
  const res = await pool.query('SELECT 1 AS ok');
  return res.rows[0]?.ok === 1;
}

module.exports = {
  pool,
  query,
  checkHealth
};
