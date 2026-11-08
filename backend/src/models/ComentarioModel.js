'use strict';

const db = require('../config/database');

class ComentarioModel {
  static async listarPorRestaurante(idRestaurante) {
    const res = await db.query(
      `SELECT id, usuario, comentario, id_restaurante, creado
       FROM comentarios
       WHERE id_restaurante = $1
       ORDER BY id DESC
       LIMIT 100`,
      [idRestaurante]
    );
    return res.rows;
  }

  static async crear({ usuario, comentario, idRestaurante }) {
    const res = await db.query(
      `INSERT INTO comentarios (usuario, comentario, id_restaurante)
       VALUES ($1, $2, $3)
       RETURNING id, usuario, comentario, id_restaurante, creado`,
      [usuario, comentario, idRestaurante]
    );
    return res.rows[0];
  }
}

module.exports = ComentarioModel;
