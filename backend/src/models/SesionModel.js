'use strict';

const db = require('../config/database');
const env = require('../config/env');
const { generateSecureToken } = require('../utils/cryptoUtils');

class SesionModel {
  static async crear({ usuarioId = null, nombreUsuario = null, restauranteId = 1, carrito = {}, ipAddress = '0.0.0.0', userAgent = '' }) {
    const sid = generateSecureToken(32);
    const csrfToken = generateSecureToken(32);
    const expiraEn = new Date(Date.now() + env.SESSION_ABSOLUTE_TIMEOUT_SEC * 1000);

    const res = await db.query(
      `INSERT INTO sesiones (sid, usuario_id, nombre_usuario, restaurante_id, csrf_token, carrito, ip_address, user_agent, expira_en)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING *`,
      [sid, usuarioId, nombreUsuario, restauranteId, csrfToken, JSON.stringify(carrito || {}), ipAddress, String(userAgent || '').slice(0, 500), expiraEn]
    );
    return res.rows[0];
  }

  static async obtenerValida(sid) {
    if (!sid || typeof sid !== 'string' || !/^[a-f0-9]{64}$/.test(sid)) {
      return null;
    }

    const res = await db.query(
      `SELECT s.*, u.estado AS usuario_estado, u.nombre AS usuario_nombre_db
       FROM sesiones s
       LEFT JOIN usuarios u ON s.usuario_id = u.id
       WHERE s.sid = $1 LIMIT 1`,
      [sid]
    );

    if (res.rowCount === 0) return null;
    const sesion = res.rows[0];

    const ahora = Date.now();
    const expiraAbsoluto = new Date(sesion.expira_en).getTime();
    const inactividadMaxMs = env.SESSION_IDLE_TIMEOUT_SEC * 1000;
    const ultimaAct = new Date(sesion.ultima_actividad).getTime();

    // Verificación ASVS v5.0 V3.3 (Nivel 3): expiración por inactividad, expiración absoluta o baja de usuario
    const usuarioInactivo = sesion.usuario_id !== null && String(sesion.usuario_estado) !== '1';
    if (ahora > expiraAbsoluto || (ahora - ultimaAct) > inactividadMaxMs || usuarioInactivo) {
      await this.eliminar(sid);
      return null;
    }

    await db.query(`UPDATE sesiones SET ultima_actividad = CURRENT_TIMESTAMP WHERE sid = $1`, [sid]);
    if (sesion.usuario_id !== null && sesion.usuario_nombre_db) {
      sesion.nombre_usuario = sesion.usuario_nombre_db;
    }
    return sesion;
  }

  /**
   * Rotación de sesión en autenticación para prevenir Session Fixation (OWASP ASVS v5.0 V3.2.1)
   */
  static async rotarEnLogin(oldSid, { usuarioId, nombreUsuario, restauranteId, carritoPrevio, ipAddress, userAgent }) {
    if (oldSid) {
      await this.eliminar(oldSid);
    }
    return this.crear({
      usuarioId,
      nombreUsuario,
      restauranteId: restauranteId || 1,
      carrito: carritoPrevio || {},
      ipAddress,
      userAgent
    });
  }

  static async actualizarRestaurante(sid, restauranteId) {
    await db.query(`UPDATE sesiones SET restaurante_id = $2, ultima_actividad = CURRENT_TIMESTAMP WHERE sid = $1`, [sid, restauranteId]);
  }

  static async actualizarCarrito(sid, carrito) {
    await db.query(
      `UPDATE sesiones SET carrito = $2::jsonb, ultima_actividad = CURRENT_TIMESTAMP WHERE sid = $1`,
      [sid, JSON.stringify(carrito || {})]
    );
  }

  static async eliminar(sid) {
    if (!sid) return;
    await db.query(`DELETE FROM sesiones WHERE sid = $1`, [sid]);
  }

  static async limpiarExpiradas() {
    await db.query(
      `DELETE FROM sesiones
       WHERE expira_en < CURRENT_TIMESTAMP
          OR ultima_actividad < (CURRENT_TIMESTAMP - ($1 || ' seconds')::interval)`,
      [String(env.SESSION_IDLE_TIMEOUT_SEC)]
    );
  }
}

module.exports = SesionModel;
