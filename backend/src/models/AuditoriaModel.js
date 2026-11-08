'use strict';

const db = require('../config/database');
const logger = require('../config/logger');

class AuditoriaModel {
  static async registrar({ evento, severidad = 'INFO', usuarioId = null, ipAddress = '0.0.0.0', requestId = 'system', detalles = {} }) {
    logger.security(evento, { severidad, usuarioId, ipAddress, requestId, detalles });
    try {
      await db.query(
        `INSERT INTO auditoria_seguridad (evento, severidad, usuario_id, ip_address, request_id, detalles)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [evento, severidad, usuarioId, ipAddress, requestId, JSON.stringify(detalles || {})]
      );
    } catch (err) {
      logger.error('AUDIT_DB_WRITE_FAILED', { message: err.message, evento });
    }
  }
}

module.exports = AuditoriaModel;
