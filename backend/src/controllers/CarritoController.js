'use strict';

const RestauranteModel = require('../models/RestauranteModel');
const SesionModel = require('../models/SesionModel');
const AuditoriaModel = require('../models/AuditoriaModel');
const JsonView = require('../views/JsonView');
const { resolveItemRef } = require('../middlewares/inputValidator');
const { encodeRef } = require('../utils/cryptoUtils');

class CarritoController {
  /**
   * GET /api/v1/carrito
   * Retorna los datos del restaurante activo en la sesi├│n y los productos del carrito con referencias ofuscadas
   */
  static async obtenerCarrito(req, res, next) {
    try {
      const idRestaurante = req.restauranteId;
      const restaurante = await RestauranteModel.obtenerPorId(idRestaurante);
      if (!restaurante) {
        return JsonView.error(res, 'El restaurante no fue encontrado.', 404, 'RESTAURANT_NOT_FOUND');
      }

      const restRef = encodeRef('rest', idRestaurante);
      const carritoObj = req.session?.carrito || {};
      const items = Object.values(carritoObj).map((item, idx) => ({
        codigoVisual: idx + 1,
        itemToken: item.itemToken || encodeRef('item', item.id),
        nombre: item.nombre,
        precio: Number(item.precio || 0)
      }));
      const total = items.reduce((acc, item) => acc + Number(item.precio || 0), 0);

      return JsonView.success(res, {
        restaurante: {
          ref: restRef,
          nombre: restaurante.nombre,
          fotoUrl: restaurante.foto ? `media/${restRef}/${encodeURIComponent(restaurante.foto)}` : null
        },
        items,
        total,
        csrfToken: req.session?.csrf_token || null
      });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * POST /api/v1/carrito/items
   * Recibe un itemToken criptogr├ífico ofuscado (nunca un id num├®rico en claro), lo desencripta y valida en PostgreSQL
   */
  static async agregarItem(req, res, next) {
    try {
      const idItem = resolveItemRef(req.body?.itemToken);
      const idRestaurante = req.restauranteId;

      if (!idItem) {
        return JsonView.error(res, 'Token de producto inv├ílido o manipulado.', 400, 'INVALID_ITEM_TOKEN');
      }

      const itemValido = await RestauranteModel.obtenerItemValidoDeRestaurante(idItem, idRestaurante);
      if (!itemValido) {
        return JsonView.error(
          res,
          'El producto no existe, no est├í disponible o no pertenece a este restaurante.',
          404,
          'ITEM_NOT_AVAILABLE'
        );
      }

      if (!req.session || !req.session.sid) {
        return JsonView.error(res, 'Sesi├│n inv├ílida o expirada.', 401, 'SESSION_EXPIRED');
      }

      let carritoActual = {};
      if (typeof req.session.carrito === 'object' && req.session.carrito !== null) {
        carritoActual = { ...req.session.carrito };
      } else if (typeof req.session.carrito === 'string') {
        try {
          carritoActual = JSON.parse(req.session.carrito);
        } catch {
          carritoActual = {};
        }
      }

      const idProd = Number(itemValido.id);
      const itemToken = encodeRef('item', idProd);

      if (Object.keys(carritoActual).length >= 50 && !carritoActual[idProd]) {
        return JsonView.error(res, 'El carrito ha alcanzado el l├¡mite m├íximo de productos.', 400, 'CART_LIMIT_REACHED');
      }

      carritoActual[idProd] = {
        id: idProd,
        itemToken,
        nombre: String(itemValido.nombre),
        precio: Number(itemValido.precio)
      };

      req.session.carrito = carritoActual;
      await SesionModel.actualizarCarrito(req.session.sid, carritoActual);

      return JsonView.success(res, {
        mensaje: 'El producto seleccionado ha sido agregado sin problemas.',
        item: {
          itemToken,
          nombre: carritoActual[idProd].nombre,
          precio: carritoActual[idProd].precio
        }
      });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * DELETE /api/v1/carrito/items/:itemToken
   * Elimina un producto del carrito usando su token ofuscado (sin exponer IDs en la URL)
   */
  static async eliminarItem(req, res, next) {
    try {
      const idItem = resolveItemRef(req.params.itemToken || req.body?.itemToken);
      if (!idItem) {
        return JsonView.error(res, 'Token de producto inv├ílido.', 400, 'INVALID_ITEM_TOKEN');
      }

      if (!req.session || !req.session.sid) {
        return JsonView.error(res, 'Sesi├│n inv├ílida o expirada.', 401, 'SESSION_EXPIRED');
      }

      let carritoActual = {};
      if (typeof req.session.carrito === 'object' && req.session.carrito !== null) {
        carritoActual = { ...req.session.carrito };
      } else if (typeof req.session.carrito === 'string') {
        try {
          carritoActual = JSON.parse(req.session.carrito);
        } catch {
          carritoActual = {};
        }
      }

      delete carritoActual[idItem];
      req.session.carrito = carritoActual;
      await SesionModel.actualizarCarrito(req.session.sid, carritoActual);

      return JsonView.success(res, {
        mensaje: 'Producto eliminado del carrito.'
      });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * DELETE /api/v1/carrito
   * Vac├¡a todos los productos del carrito de la sesi├│n actual
   */
  static async vaciarCarrito(req, res, next) {
    try {
      if (req.session?.sid) {
        req.session.carrito = {};
        await SesionModel.actualizarCarrito(req.session.sid, {});
      }
      await AuditoriaModel.registrar({
        evento: 'CART_CLEARED',
        severidad: 'INFO',
        usuarioId: req.session?.usuario_id || null,
        ipAddress: req.ip || '0.0.0.0',
        requestId: res.locals.requestId
      });

      return JsonView.success(res, {
        mensaje: 'Carrito vaciado correctamente.',
        items: []
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = CarritoController;
