'use strict';

const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const db = require('./config/database');
const SesionModel = require('./models/SesionModel');

function runStartupMigration(attempt = 1) {
  db.ensureSchema()
    .then(() => logger.info('DB_SCHEMA_VERIFIED'))
    .catch((err) => {
      logger.warn('DB_SCHEMA_MIGRATION_DEFERRED', { attempt, message: err.message });
      if (attempt < 5) {
        const retryTimer = setTimeout(() => runStartupMigration(attempt + 1), 2000);
        retryTimer.unref();
      }
    });
}

const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info('BACKEND_SERVER_STARTED', {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    asvsStandard: 'OWASP ASVS v5.0 Level 3'
  });
  runStartupMigration();
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
