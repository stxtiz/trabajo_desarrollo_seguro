'use strict';

const RestauranteModel = require('../models/RestauranteModel');
const ComentarioModel = require('../models/ComentarioModel');
const SesionModel = require('../models/SesionModel');
const JsonView = require('../views/JsonView');
const { encodeRef } = require('../utils/cryptoUtils');

class CartaController {
  /**
   * GET /api/v1/carta (o /api/v1/carta/:ref)
   * Devuelve todos los datos de la Carta Digital con identificadores y rutas de imagen ofuscadas
   * para que nunca se exponga id=1, keyid=1 ni cod1 en las URLs (OWASP ASVS v5.0 V4.2.1).
   */
  static async obtenerCartaCompleta(req, res, next) {
    try {
      const idRestaurante = req.restauranteId;
      const restaurante = await RestauranteModel.obtenerPorId(idRestaurante);

      if (!restaurante) {
        return JsonView.error(res, 'El restaurante no fue encontrado.', 404, 'RESTAURANT_NOT_FOUND');
      }

      if (req.session) {
        await SesionModel.actualizarRestaurante(req.session.sid, idRestaurante);
      }

      const [destacadosRaw, cartasRaw, comentariosRaw] = await Promise.all([
        RestauranteModel.obtenerDestacados(idRestaurante),
        RestauranteModel.obtenerEstructuraCarta(idRestaurante),
        ComentarioModel.listarPorRestaurante(idRestaurante)
      ]);

      const restRef = encodeRef('rest', idRestaurante);

      const restauranteOfuscado = {
        ref: restRef,
        nombre: restaurante.nombre,
        calle: restaurante.calle,
        numero: restaurante.numero,
        comuna: restaurante.comuna,
        region: restaurante.region,
        fono: restaurante.fono,
        email: restaurante.email,
        fotoUrl: restaurante.foto ? `media/${restRef}/${encodeURIComponent(restaurante.foto)}` : null
      };

      const destacados = destacadosRaw.map((item) => ({
        itemToken: encodeRef('item', item.id),
        nombre: item.nombre,
        descripcion: item.descripcion,
        observaciones: item.observaciones,
        tiempo: item.tiempo,
        puntuacion: item.puntuacion,
        precio: item.precio,
        fotoUrl: item.foto ? `media/${restRef}/${encodeURIComponent(item.foto)}` : null
      }));

      const cartas = cartasRaw.map((carta) => ({
        cartaToken: encodeRef('carta', carta.id),
        nombre: carta.nombre,
        orden: carta.orden,
        categorias: (carta.categorias || []).map((cat) => ({
          categoriaToken: encodeRef('cat', cat.id),
          nombre: cat.nombre,
          items: (cat.items || []).map((item) => ({
            itemToken: encodeRef('item', item.id),
            nombre: item.nombre,
            descripcion: item.descripcion,
            observaciones: item.observaciones,
            tiempo: item.tiempo,
            puntuacion: item.puntuacion,
            precio: item.precio,
            fotoUrl: item.foto ? `media/${restRef}/${encodeURIComponent(item.foto)}` : null
          }))
        }))
      }));

      const comentarios = comentariosRaw.map((c) => ({
        usuario: c.usuario,
        comentario: c.comentario,
        creado: c.creado
      }));

      return JsonView.success(res, {
        restaurante: restauranteOfuscado,
        destacados,
        cartas,
        comentarios,
        sesion: {
          autenticado: Boolean(req.session?.usuario_id),
          nombre: req.session?.nombre_usuario || null,
          csrfToken: req.session?.csrf_token || null
        }
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = CartaController;
