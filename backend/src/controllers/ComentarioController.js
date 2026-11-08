'use strict';

const ComentarioModel = require('../models/ComentarioModel');
const RestauranteModel = require('../models/RestauranteModel');
const AuditoriaModel = require('../models/AuditoriaModel');
const JsonView = require('../views/JsonView');
const { validateComentarioText } = require('../middlewares/inputValidator');

class ComentarioController {
  /**
   * POST /api/v1/comentarios
   * Crea un comentario asociado al restaurante activo en la sesión sin exponer IDs en la URL (ASVS v5.0 V4 & V5)
   */
  static async crearComentario(req, res, next) {
    try {
      const idRestaurante = req.restauranteId;
      const comentarioTexto = validateComentarioText(req.body?.comentario);
      const usuarioSesion = req.session?.nombre_usuario;

      if (!idRestaurante || !comentarioTexto) {
        return JsonView.error(res, 'Datos de comentario inválidos.', 400, 'INVALID_COMMENT_DATA');
      }

      const restaurante = await RestauranteModel.obtenerPorId(idRestaurante);
      if (!restaurante) {
        return JsonView.error(res, 'El restaurante no existe.', 404, 'RESTAURANT_NOT_FOUND');
      }

      const nuevoComentario = await ComentarioModel.crear({
        usuario: usuarioSesion,
        comentario: comentarioTexto,
        idRestaurante
      });

      await AuditoriaModel.registrar({
        evento: 'COMMENT_CREATED',
        severidad: 'INFO',
        usuarioId: req.session.usuario_id,
        ipAddress: req.ip || '0.0.0.0',
        requestId: res.locals.requestId,
        detalles: { idRestaurante, comentarioId: nuevoComentario.id }
      });

      return JsonView.success(
        res,
        {
          comentario: {
            usuario: nuevoComentario.usuario,
            comentario: nuevoComentario.comentario,
            creado: nuevoComentario.creado
          }
        },
        201
      );
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = ComentarioController;
