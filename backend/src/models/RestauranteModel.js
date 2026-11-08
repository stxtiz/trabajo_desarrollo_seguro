'use strict';

const db = require('../config/database');

class RestauranteModel {
  static async obtenerPorId(idRestaurante) {
    const res = await db.query(
      `SELECT d.calle, d.numero, d.comuna, d.region,
              r.nombre, r.id, r.fono, r.email, r.foto
       FROM restaurantes r
       INNER JOIN direcciones d ON r.direcciones_id = d.id
       WHERE r.id = $1 AND r.eliminado IS NULL
       LIMIT 1`,
      [idRestaurante]
    );
    return res.rows[0] || null;
  }

  static async obtenerDestacados(idRestaurante) {
    const res = await db.query(
      `SELECT i.id, i.visible, i.tiempo, i.puntuacion, i.destacado, i.precio,
              i.descripcion, i.observaciones, i.nombre, i.foto, i.orden,
              c.restaurantes_id
       FROM categorias cat
       INNER JOIN items i ON i.categorias_id = cat.id
       INNER JOIN cartas c ON cat.cartas_id = c.id
       WHERE i.destacado = TRUE
         AND i.eliminado IS NULL
         AND i.visible = TRUE
         AND c.restaurantes_id = $1
         AND c.eliminada IS NULL
         AND c.visible = TRUE
         AND cat.visible = TRUE
         AND cat.eliminado IS NULL
       ORDER BY i.orden ASC NULLS LAST, i.id ASC`,
      [idRestaurante]
    );
    return res.rows;
  }

  static async obtenerEstructuraCarta(idRestaurante) {
    const cartasRes = await db.query(
      `SELECT id, restaurantes_id, nombre, orden, visible
       FROM cartas
       WHERE restaurantes_id = $1 AND visible = TRUE AND eliminada IS NULL
       ORDER BY orden ASC NULLS LAST, id ASC`,
      [idRestaurante]
    );
    const cartas = cartasRes.rows;
    if (cartas.length === 0) return [];

    const categoriasRes = await db.query(
      `SELECT id, nombre, cartas_id, orden
       FROM categorias
       WHERE visible = TRUE AND eliminado IS NULL AND cartas_id = ANY($1::int[])
       ORDER BY orden ASC NULLS LAST, id ASC`,
      [cartas.map((c) => c.id)]
    );
    const categorias = categoriasRes.rows;

    let items = [];
    if (categorias.length > 0) {
      const itemsRes = await db.query(
        `SELECT id, visible, nombre, descripcion, observaciones, tiempo,
                puntuacion, precio, foto, orden, categorias_id
         FROM items
         WHERE visible = TRUE AND eliminado IS NULL AND categorias_id = ANY($1::int[])
         ORDER BY orden ASC NULLS LAST, id ASC`,
        [categorias.map((cat) => cat.id)]
      );
      items = itemsRes.rows;
    }

    const itemsPorCategoria = new Map();
    for (const item of items) {
      if (!itemsPorCategoria.has(item.categorias_id)) {
        itemsPorCategoria.set(item.categorias_id, []);
      }
      itemsPorCategoria.get(item.categorias_id).push(item);
    }

    const categoriasPorCarta = new Map();
    for (const cat of categorias) {
      if (!categoriasPorCarta.has(cat.cartas_id)) {
        categoriasPorCarta.set(cat.cartas_id, []);
      }
      categoriasPorCarta.get(cat.cartas_id).push({
        id: cat.id,
        nombre: cat.nombre,
        items: itemsPorCategoria.get(cat.id) || []
      });
    }

    return cartas.map((carta) => ({
      id: carta.id,
      nombre: carta.nombre,
      orden: carta.orden,
      categorias: categoriasPorCarta.get(carta.id) || []
    }));
  }

  /**
   * Valida que un ítem exista, esté visible y pertenezca al restaurante activo (ASVS v5.0 V4 & V11)
   */
  static async obtenerItemValidoDeRestaurante(idItem, idRestaurante) {
    const res = await db.query(
      `SELECT i.id, i.nombre, i.precio
       FROM items i
       INNER JOIN categorias cat ON i.categorias_id = cat.id
       INNER JOIN cartas c ON cat.cartas_id = c.id
       WHERE i.id = $1
         AND i.visible = TRUE AND i.eliminado IS NULL
         AND cat.visible = TRUE AND cat.eliminado IS NULL
         AND c.visible = TRUE AND c.eliminada IS NULL
         AND c.restaurantes_id = $2
       LIMIT 1`,
      [idItem, idRestaurante]
    );
    return res.rows[0] || null;
  }
}

module.exports = RestauranteModel;
