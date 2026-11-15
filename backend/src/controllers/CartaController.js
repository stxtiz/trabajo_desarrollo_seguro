'use strict';

const RestauranteModel = require('../models/RestauranteModel');
const ComentarioModel = require('../models/ComentarioModel');
const SesionModel = require('../models/SesionModel');
const JsonView = require('../views/JsonView');
const { encodeRef, decodeRef } = require('../utils/cryptoUtils');

function formatRestauranteResumen(r) {
  const ref = encodeRef('rest', r.id);
  return {
    ref,
    nombre: r.nombre,
    comuna: r.comuna,
    fotoUrl: RestauranteModel.resolveFotoUrl(ref, r.foto, r.foto_data)
  };
}

class CartaController {
  /**
   * GET /api/v1/restaurantes
   * Lista los restaurantes activos con sus referencias criptográficas ofuscadas.
   */
  static async listarRestaurantes(req, res, next) {
    try {
      const activos = await RestauranteModel.listarActivos();
      return JsonView.success(res, {
        restaurantes: activos.map(formatRestauranteResumen)
      });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * POST /api/v1/restaurantes/seleccionar
   * Cambia el restaurante activo en la sesión del servidor y limpia el carrito si cambia de restaurante.
   */
  static async seleccionarRestaurante(req, res, next) {
    try {
      const rawRef = req.body?.restauranteRef || req.headers['x-carta-ref'];
      const idRestaurante = decodeRef('rest', String(rawRef || '').trim());
      if (!idRestaurante) {
        return JsonView.error(res, 'Referencia opaca de restaurante inválida o manipulada.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const restaurante = await RestauranteModel.obtenerPorId(idRestaurante);
      if (!restaurante) {
        return JsonView.error(res, 'El restaurante no fue encontrado.', 404, 'RESTAURANT_NOT_FOUND');
      }

      if (req.session) {
        const changed = Number(req.session.restaurante_id) !== Number(idRestaurante);
        await SesionModel.actualizarRestaurante(req.session.sid, idRestaurante);
        req.session.restaurante_id = idRestaurante;
        if (changed) {
          req.session.carrito = {};
        }
      }

      return JsonView.success(res, {
        restauranteRef: encodeRef('rest', idRestaurante),
        csrfToken: req.session?.csrf_token || null,
        mensaje: 'Restaurante seleccionado correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * GET /api/v1/carta (o /api/v1/carta/:ref)
   * Devuelve todos los datos de la Carta Digital con identificadores y rutas de imagen ofuscadas
   * para que nunca se exponga id=1, keyid=1 ni cod1 en las URLs (OWASP ASVS v5.0 V4.2.1).
   */
  static async obtenerCartaCompleta(req, res, next) {
    try {
      let idRestaurante = req.restauranteId;
      let [restaurante, activos] = await Promise.all([
        RestauranteModel.obtenerPorId(idRestaurante),
        RestauranteModel.listarActivos()
      ]);

      if (!restaurante && !req.explicitRestauranteRef && activos.length > 0) {
        idRestaurante = activos[0].id;
        restaurante = await RestauranteModel.obtenerPorId(idRestaurante);
      }

      if (!restaurante) {
        return JsonView.error(res, 'El restaurante no fue encontrado.', 404, 'RESTAURANT_NOT_FOUND');
      }

      if (req.session) {
        const changed = Number(req.session.restaurante_id) !== Number(idRestaurante);
        await SesionModel.actualizarRestaurante(req.session.sid, idRestaurante);
        req.session.restaurante_id = idRestaurante;
        if (changed) {
          req.session.carrito = {};
        }
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
        fotoUrl: RestauranteModel.resolveFotoUrl(restRef, restaurante.foto, restaurante.foto_data)
      };

      const destacados = destacadosRaw.map((item) => ({
        itemToken: encodeRef('item', item.id),
        nombre: item.nombre,
        descripcion: item.descripcion,
        observaciones: item.observaciones,
        tiempo: item.tiempo,
        puntuacion: item.puntuacion,
        precio: item.precio,
        fotoUrl: RestauranteModel.resolveFotoUrl(restRef, item.foto, item.foto_data)
      }));

      const cartas = cartasRaw.map((carta) => ({
        cartaToken: encodeRef('carta', carta.id),
        nombre: carta.nombre,
        orden: carta.orden,
        fotoUrl: RestauranteModel.resolveFotoUrl(restRef, carta.foto, carta.foto_data),
        categorias: (carta.categorias || []).map((cat) => ({
          categoriaToken: encodeRef('cat', cat.id),
          nombre: cat.nombre,
          fotoUrl: RestauranteModel.resolveFotoUrl(restRef, cat.foto, cat.foto_data),
          items: (cat.items || []).map((item) => ({
            itemToken: encodeRef('item', item.id),
            nombre: item.nombre,
            descripcion: item.descripcion,
            observaciones: item.observaciones,
            tiempo: item.tiempo,
            puntuacion: item.puntuacion,
            precio: item.precio,
            fotoUrl: RestauranteModel.resolveFotoUrl(restRef, item.foto, item.foto_data)
          }))
        }))
      }));

      const comentarios = comentariosRaw.map((c) => ({
        usuario: c.usuario,
        comentario: c.comentario,
        creado: c.creado
      }));

      const autenticado = Boolean(req.session?.usuario_id);

      return JsonView.success(res, {
        restaurante: restauranteOfuscado,
        restaurantes: activos.map(formatRestauranteResumen),
        destacados,
        cartas,
        comentarios,
        sesion: {
          autenticado,
          nombre: req.session?.nombre_usuario || null,
          rol: autenticado ? (req.session?.rol || 'user') : null,
          csrfToken: req.session?.csrf_token || null
        }
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = CartaController;
