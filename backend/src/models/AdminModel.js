'use strict';

const db = require('../config/database');
const UsuarioModel = require('./UsuarioModel');

class AdminModel {
  static async ensureSchema() {
    return db.ensureSchema();
  }

  // ==================== RESTAURANTES + DIRECCIONES ====================

  static async listarRestaurantes() {
    const res = await db.query(
      `SELECT r.id, r.rut, r.nombre, r.fono, r.email, r.mapa, r.foto, r.foto_data,
              d.calle, d.numero, d.comuna, d.region
       FROM restaurantes r
       INNER JOIN direcciones d ON r.direcciones_id = d.id
       WHERE r.eliminado IS NULL
       ORDER BY r.id ASC`
    );
    return res.rows;
  }

  static async obtenerRestaurantePorId(idRestaurante) {
    const res = await db.query(
      `SELECT r.id, r.rut, r.nombre, r.fono, r.email, r.mapa, r.foto, r.foto_data,
              d.calle, d.numero, d.comuna, d.region
       FROM restaurantes r
       INNER JOIN direcciones d ON r.direcciones_id = d.id
       WHERE r.id = $1 AND r.eliminado IS NULL
       LIMIT 1`,
      [idRestaurante]
    );
    return res.rows[0] || null;
  }

  static async crearRestaurante({ rut, nombre, fono, email, mapa, foto, fotoData, calle, numero, comuna, region }) {
    return db.withTransaction(async (client) => {
      const dirRes = await client.query(
        `INSERT INTO direcciones (calle, numero, comuna, region)
         VALUES ($1, $2, $3, $4)
         RETURNING id, calle, numero, comuna, region`,
        [calle, numero, comuna, region]
      );
      const dir = dirRes.rows[0];

      const restRes = await client.query(
        `INSERT INTO restaurantes (rut, nombre, fono, email, mapa, foto, foto_data, direcciones_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, rut, nombre, fono, email, mapa, foto, foto_data`,
        [rut, nombre, fono, email, mapa, foto, fotoData ?? null, dir.id]
      );
      const rest = restRes.rows[0];

      return {
        ...rest,
        calle: dir.calle,
        numero: dir.numero,
        comuna: dir.comuna,
        region: dir.region
      };
    });
  }

  static async actualizarRestaurante(
    idRestaurante,
    { rut, nombre, fono, email, mapa, foto, fotoDataProvided, fotoData, calle, numero, comuna, region }
  ) {
    return db.withTransaction(async (client) => {
      const existingRes = await client.query(
        `SELECT id, direcciones_id FROM restaurantes WHERE id = $1 AND eliminado IS NULL LIMIT 1`,
        [idRestaurante]
      );
      if (existingRes.rowCount === 0) {
        return null;
      }
      const { direcciones_id: idDireccion } = existingRes.rows[0];

      const dirRes = await client.query(
        `UPDATE direcciones
         SET calle = $2,
             numero = $3,
             comuna = $4,
             region = $5,
             actualizado = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING calle, numero, comuna, region`,
        [idDireccion, calle, numero, comuna, region]
      );

      const restRes = await client.query(
        `UPDATE restaurantes
         SET rut = $2,
             nombre = $3,
             fono = $4,
             email = $5,
             mapa = $6,
             foto = $7,
             foto_data = CASE WHEN $8::boolean THEN $9::text ELSE foto_data END,
             actualizado = CURRENT_TIMESTAMP
         WHERE id = $1 AND eliminado IS NULL
         RETURNING id, rut, nombre, fono, email, mapa, foto, foto_data`,
        [idRestaurante, rut, nombre, fono, email, mapa, foto, Boolean(fotoDataProvided), fotoData ?? null]
      );

      if (restRes.rowCount === 0) {
        return null;
      }

      return {
        ...restRes.rows[0],
        ...dirRes.rows[0]
      };
    });
  }

  static async eliminarRestaurante(idRestaurante) {
    return db.withTransaction(async (client) => {
      const targetRes = await client.query(
        `SELECT id FROM restaurantes WHERE id = $1 AND eliminado IS NULL LIMIT 1`,
        [idRestaurante]
      );
      if (targetRes.rowCount === 0) {
        return { status: 'NOT_FOUND' };
      }

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total FROM restaurantes WHERE eliminado IS NULL`
      );
      if (Number(countRes.rows[0]?.total || 0) <= 1) {
        return { status: 'LAST_RESTAURANT' };
      }

      await client.query(
        `UPDATE restaurantes
         SET eliminado = CURRENT_TIMESTAMP,
             actualizado = CURRENT_TIMESTAMP
         WHERE id = $1 AND eliminado IS NULL`,
        [idRestaurante]
      );

      const nextRes = await client.query(
        `SELECT id FROM restaurantes WHERE eliminado IS NULL ORDER BY id ASC LIMIT 1`
      );

      return {
        status: 'DELETED',
        fallbackRestauranteId: nextRes.rows[0]?.id || null
      };
    });
  }

  // ==================== CARTAS ====================

  static async listarCartas(idRestaurante) {
    const res = await db.query(
      `SELECT id, restaurantes_id, nombre, orden, visible, foto, foto_data
       FROM cartas
       WHERE restaurantes_id = $1 AND eliminada IS NULL
       ORDER BY orden ASC NULLS LAST, id ASC`,
      [idRestaurante]
    );
    return res.rows;
  }

  static async crearCarta({ idRestaurante, nombre, orden, visible, foto, fotoData }) {
    const restRes = await db.query(
      `SELECT id FROM restaurantes WHERE id = $1 AND eliminado IS NULL LIMIT 1`,
      [idRestaurante]
    );
    if (restRes.rowCount === 0) return null;

    const res = await db.query(
      `INSERT INTO cartas (restaurantes_id, nombre, orden, visible, foto, foto_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, restaurantes_id, nombre, orden, visible, foto, foto_data`,
      [idRestaurante, nombre, orden, visible, foto, fotoData ?? null]
    );
    return res.rows[0];
  }

  static async actualizarCarta(idCarta, { nombre, orden, visible, foto, fotoDataProvided, fotoData }) {
    const res = await db.query(
      `UPDATE cartas
       SET nombre = $2,
           orden = $3,
           visible = $4,
           foto = $5,
           foto_data = CASE WHEN $6::boolean THEN $7::text ELSE foto_data END,
           actualizada = CURRENT_TIMESTAMP
       WHERE id = $1 AND eliminada IS NULL
       RETURNING id, restaurantes_id, nombre, orden, visible, foto, foto_data`,
      [idCarta, nombre, orden, visible, foto, Boolean(fotoDataProvided), fotoData ?? null]
    );
    return res.rows[0] || null;
  }

  static async eliminarCarta(idCarta) {
    const res = await db.query(
      `UPDATE cartas
       SET eliminada = CURRENT_TIMESTAMP,
           actualizada = CURRENT_TIMESTAMP
       WHERE id = $1 AND eliminada IS NULL
       RETURNING id, restaurantes_id`,
      [idCarta]
    );
    return res.rows[0] || null;
  }

  // ==================== CATEGORIAS ====================

  static async listarCategorias({ idRestaurante, idCarta = null }) {
    if (idCarta) {
      const res = await db.query(
        `SELECT cat.id, cat.cartas_id, cat.nombre, cat.orden, cat.visible, cat.foto, cat.foto_data,
                c.nombre AS carta_nombre, c.restaurantes_id
         FROM categorias cat
         INNER JOIN cartas c ON cat.cartas_id = c.id
         WHERE cat.eliminado IS NULL AND c.eliminada IS NULL AND c.id = $1
         ORDER BY cat.orden ASC NULLS LAST, cat.id ASC`,
        [idCarta]
      );
      return res.rows;
    }

    const res = await db.query(
      `SELECT cat.id, cat.cartas_id, cat.nombre, cat.orden, cat.visible, cat.foto, cat.foto_data,
              c.nombre AS carta_nombre, c.restaurantes_id
       FROM categorias cat
       INNER JOIN cartas c ON cat.cartas_id = c.id
       WHERE cat.eliminado IS NULL AND c.eliminada IS NULL AND c.restaurantes_id = $1
       ORDER BY c.orden ASC NULLS LAST, c.id ASC, cat.orden ASC NULLS LAST, cat.id ASC`,
      [idRestaurante]
    );
    return res.rows;
  }

  static async crearCategoria({ idCarta, nombre, orden, visible, foto, fotoData }) {
    const cartaRes = await db.query(
      `SELECT id, nombre, restaurantes_id FROM cartas WHERE id = $1 AND eliminada IS NULL LIMIT 1`,
      [idCarta]
    );
    if (cartaRes.rowCount === 0) return null;
    const carta = cartaRes.rows[0];

    const res = await db.query(
      `INSERT INTO categorias (cartas_id, nombre, orden, visible, foto, foto_data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, cartas_id, nombre, orden, visible, foto, foto_data`,
      [idCarta, nombre, orden, visible, foto, fotoData ?? null]
    );
    return {
      ...res.rows[0],
      carta_nombre: carta.nombre,
      restaurantes_id: carta.restaurantes_id
    };
  }

  static async actualizarCategoria(
    idCategoria,
    { idCarta, nombre, orden, visible, foto, fotoDataProvided, fotoData }
  ) {
    let targetCarta = null;
    if (idCarta) {
      const cartaRes = await db.query(
        `SELECT id, nombre, restaurantes_id FROM cartas WHERE id = $1 AND eliminada IS NULL LIMIT 1`,
        [idCarta]
      );
      if (cartaRes.rowCount === 0) {
        return { error: 'CARTA_NOT_FOUND' };
      }
      targetCarta = cartaRes.rows[0];
    }

    const res = await db.query(
      `UPDATE categorias
       SET cartas_id = COALESCE($2, cartas_id),
           nombre = $3,
           orden = $4,
           visible = $5,
           foto = $6,
           foto_data = CASE WHEN $7::boolean THEN $8::text ELSE foto_data END,
           actualizado = CURRENT_TIMESTAMP
       WHERE id = $1 AND eliminado IS NULL
       RETURNING id, cartas_id, nombre, orden, visible, foto, foto_data`,
      [idCategoria, targetCarta ? targetCarta.id : null, nombre, orden, visible, foto, Boolean(fotoDataProvided), fotoData ?? null]
    );
    if (res.rowCount === 0) return null;

    const row = res.rows[0];
    if (!targetCarta) {
      const cartaInfo = await db.query(`SELECT nombre, restaurantes_id FROM cartas WHERE id = $1`, [row.cartas_id]);
      targetCarta = cartaInfo.rows[0] || { nombre: '', restaurantes_id: 1 };
    }

    return {
      ...row,
      carta_nombre: targetCarta.nombre,
      restaurantes_id: targetCarta.restaurantes_id
    };
  }

  static async eliminarCategoria(idCategoria) {
    const res = await db.query(
      `UPDATE categorias
       SET eliminado = CURRENT_TIMESTAMP,
           actualizado = CURRENT_TIMESTAMP
       WHERE id = $1 AND eliminado IS NULL
       RETURNING id`,
      [idCategoria]
    );
    return res.rows[0] || null;
  }

  // ==================== ITEMS ====================

  static async listarItems(idRestaurante) {
    const res = await db.query(
      `SELECT i.id, i.categorias_id, i.nombre, i.descripcion, i.observaciones, i.tiempo,
              i.precio, i.puntuacion, i.visible, i.destacado, i.orden, i.foto, i.foto_data,
              cat.nombre AS categoria_nombre,
              c.id AS carta_id, c.nombre AS carta_nombre, c.restaurantes_id
       FROM items i
       INNER JOIN categorias cat ON i.categorias_id = cat.id
       INNER JOIN cartas c ON cat.cartas_id = c.id
       WHERE i.eliminado IS NULL
         AND cat.eliminado IS NULL
         AND c.eliminada IS NULL
         AND c.restaurantes_id = $1
       ORDER BY c.orden ASC NULLS LAST, c.id ASC, cat.orden ASC NULLS LAST, cat.id ASC, i.orden ASC NULLS LAST, i.id ASC`,
      [idRestaurante]
    );
    return res.rows;
  }

  static async obtenerItemConJerarquia(idItem) {
    const res = await db.query(
      `SELECT i.id, i.categorias_id, i.nombre, i.descripcion, i.observaciones, i.tiempo,
              i.precio, i.puntuacion, i.visible, i.destacado, i.orden, i.foto, i.foto_data,
              cat.nombre AS categoria_nombre,
              c.id AS carta_id, c.nombre AS carta_nombre, c.restaurantes_id
       FROM items i
       INNER JOIN categorias cat ON i.categorias_id = cat.id
       INNER JOIN cartas c ON cat.cartas_id = c.id
       WHERE i.id = $1 AND i.eliminado IS NULL
       LIMIT 1`,
      [idItem]
    );
    return res.rows[0] || null;
  }

  static async crearItem({
    idCategoria,
    nombre,
    descripcion,
    observaciones,
    tiempo,
    precio,
    puntuacion,
    visible,
    destacado,
    orden,
    foto,
    fotoData
  }) {
    const catRes = await db.query(
      `SELECT cat.id
       FROM categorias cat
       INNER JOIN cartas c ON cat.cartas_id = c.id
       WHERE cat.id = $1 AND cat.eliminado IS NULL AND c.eliminada IS NULL
       LIMIT 1`,
      [idCategoria]
    );
    if (catRes.rowCount === 0) return null;

    const insertRes = await db.query(
      `INSERT INTO items (categorias_id, nombre, descripcion, observaciones, tiempo, precio, puntuacion, visible, destacado, orden, foto, foto_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [idCategoria, nombre, descripcion, observaciones, tiempo, precio, puntuacion, visible, destacado, orden, foto, fotoData ?? null]
    );
    return this.obtenerItemConJerarquia(insertRes.rows[0].id);
  }

  static async actualizarItem(
    idItem,
    {
      idCategoria,
      nombre,
      descripcion,
      observaciones,
      tiempo,
      precio,
      puntuacion,
      visible,
      destacado,
      orden,
      foto,
      fotoDataProvided,
      fotoData
    }
  ) {
    if (idCategoria) {
      const catRes = await db.query(
        `SELECT cat.id
         FROM categorias cat
         INNER JOIN cartas c ON cat.cartas_id = c.id
         WHERE cat.id = $1 AND cat.eliminado IS NULL AND c.eliminada IS NULL
         LIMIT 1`,
        [idCategoria]
      );
      if (catRes.rowCount === 0) {
        return { error: 'CATEGORY_NOT_FOUND' };
      }
    }

    const res = await db.query(
      `UPDATE items
       SET categorias_id = COALESCE($2, categorias_id),
           nombre = $3,
           descripcion = $4,
           observaciones = $5,
           tiempo = $6,
           precio = $7,
           puntuacion = $8,
           visible = $9,
           destacado = $10,
           orden = $11,
           foto = $12,
           foto_data = CASE WHEN $13::boolean THEN $14::text ELSE foto_data END,
           actualizado = CURRENT_TIMESTAMP
       WHERE id = $1 AND eliminado IS NULL
       RETURNING id`,
      [
        idItem,
        idCategoria || null,
        nombre,
        descripcion,
        observaciones,
        tiempo,
        precio,
        puntuacion,
        visible,
        destacado,
        orden,
        foto,
        Boolean(fotoDataProvided),
        fotoData ?? null
      ]
    );
    if (res.rowCount === 0) return null;
    return this.obtenerItemConJerarquia(idItem);
  }

  static async eliminarItem(idItem) {
    const res = await db.query(
      `UPDATE items
       SET eliminado = CURRENT_TIMESTAMP,
           actualizado = CURRENT_TIMESTAMP
       WHERE id = $1 AND eliminado IS NULL
       RETURNING id`,
      [idItem]
    );
    return res.rows[0] || null;
  }

  // ==================== COMENTARIOS ====================

  static async listarComentarios(idRestaurante) {
    const res = await db.query(
      `SELECT id, usuario, comentario, id_restaurante, creado
       FROM comentarios
       WHERE id_restaurante = $1
       ORDER BY id DESC
       LIMIT 200`,
      [idRestaurante]
    );
    return res.rows;
  }

  static async actualizarComentario(idComentario, comentario) {
    const res = await db.query(
      `UPDATE comentarios
       SET comentario = $2
       WHERE id = $1
       RETURNING id, usuario, comentario, id_restaurante, creado`,
      [idComentario, comentario]
    );
    return res.rows[0] || null;
  }

  static async eliminarComentario(idComentario) {
    const res = await db.query(
      `DELETE FROM comentarios
       WHERE id = $1
       RETURNING id, id_restaurante`,
      [idComentario]
    );
    return res.rows[0] || null;
  }

  // ==================== USUARIOS ====================

  static async listarUsuarios() {
    const res = await db.query(
      `SELECT id, nombre, email, rol, estado, intentos_fallidos, bloqueado_hasta, ultimo_acceso
       FROM usuarios
       ORDER BY id ASC`
    );
    return res.rows.map((u) => ({
      ...u,
      rol: UsuarioModel.resolveRol(u)
    }));
  }

  static async crearUsuario({ nombre, email, passwordHash, rol, estado }) {
    const existing = await db.query(
      `SELECT id FROM usuarios WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );
    if (existing.rowCount > 0) {
      return { error: 'EMAIL_EXISTS' };
    }

    const res = await db.query(
      `INSERT INTO usuarios (nombre, email, password, rol, estado)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, email, rol, estado, intentos_fallidos, bloqueado_hasta, ultimo_acceso`,
      [nombre, email, passwordHash, rol, estado]
    );
    return res.rows[0];
  }

  static async actualizarUsuario(idUsuario, { nombre, email, passwordHash, rol, estado }) {
    const dup = await db.query(
      `SELECT id FROM usuarios WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1`,
      [email, idUsuario]
    );
    if (dup.rowCount > 0) {
      return { error: 'EMAIL_EXISTS' };
    }

    const resetLockout = String(estado) === '1';
    const res = await db.query(
      `UPDATE usuarios
       SET nombre = $2,
           email = $3,
           rol = $4,
           estado = $5,
           password = COALESCE($6, password),
           intentos_fallidos = CASE WHEN $7::boolean THEN 0 ELSE intentos_fallidos END,
           bloqueado_hasta = CASE WHEN $7::boolean THEN NULL ELSE bloqueado_hasta END
       WHERE id = $1
       RETURNING id, nombre, email, rol, estado, intentos_fallidos, bloqueado_hasta, ultimo_acceso`,
      [idUsuario, nombre, email, rol, estado, passwordHash || null, resetLockout]
    );

    if (res.rowCount === 0) return null;

    // Revocar sesiones activas si se desactiva el usuario o cambia su contraseña (ASVS v5.0 V3.3)
    if (String(estado) !== '1' || passwordHash) {
      await db.query(`DELETE FROM sesiones WHERE usuario_id = $1`, [idUsuario]);
    }

    return res.rows[0];
  }

  static async eliminarUsuario(idUsuario) {
    const res = await db.query(
      `DELETE FROM usuarios WHERE id = $1 RETURNING id`,
      [idUsuario]
    );
    return res.rows[0] || null;
  }
}

module.exports = AdminModel;
