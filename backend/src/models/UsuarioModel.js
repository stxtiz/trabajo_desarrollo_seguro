'use strict';

const db = require('../config/database');

class UsuarioModel {
  static async buscarPorEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const res = await db.query(
      `SELECT id, nombre, email, password, estado, intentos_fallidos, bloqueado_hasta
       FROM usuarios
       WHERE LOWER(email) = $1
       LIMIT 1`,
      [normalizedEmail]
    );
    return res.rows[0] || null;
  }

  static async registrarIntentoFallido(idUsuario, maxIntentos = 5, minutosBloqueo = 15) {
    await db.query(
      `UPDATE usuarios
       SET intentos_fallidos = intentos_fallidos + 1,
           bloqueado_hasta = CASE
             WHEN (intentos_fallidos + 1) >= $2 THEN CURRENT_TIMESTAMP + ($3 || ' minutes')::interval
             ELSE bloqueado_hasta
           END
       WHERE id = $1`,
      [idUsuario, maxIntentos, String(minutosBloqueo)]
    );
  }

  static async registrarLoginExitoso(idUsuario) {
    await db.query(
      `UPDATE usuarios
       SET intentos_fallidos = 0,
           bloqueado_hasta = NULL,
           ultimo_acceso = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [idUsuario]
    );
  }

  static async actualizarPasswordHash(idUsuario, nuevoHash) {
    await db.query(`UPDATE usuarios SET password = $2 WHERE id = $1`, [idUsuario, nuevoHash]);
  }
}

module.exports = UsuarioModel;
