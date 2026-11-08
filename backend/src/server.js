'use strict';

const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const db = require('./config/database');
const SesionModel = require('./models/SesionModel');

const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info('BACKEND_SERVER_STARTED', {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    asvsStandard: 'OWASP ASVS v5.0 Level 3'
  });
});

// Tarea periódica de limpieza de sesiones expiradas en PostgreSQL (cada 5 minutos)
const cleanupInterval = setInterval(() => {
  SesionModel.limpiarExpiradas().catch((err) => {
    logger.warn('SESSION_CLEANUP_WARNING', { message: err.message });
  });
}, 5 * 60 * 1000);
cleanupInterval.unref();

function gracefulShutdown(signal) {
  logger.info('BACKEND_SHUTDOWN_SIGNAL', { signal });
  clearInterval(cleanupInterval);
  server.close(async () => {
    await db.pool.end().catch(() => {});
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
