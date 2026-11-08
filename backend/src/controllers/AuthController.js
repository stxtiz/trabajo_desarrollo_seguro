'use strict';

const UsuarioModel = require('../models/UsuarioModel');
const SesionModel = require('../models/SesionModel');
const AuditoriaModel = require('../models/AuditoriaModel');
const JsonView = require('../views/JsonView');
const { verifyPassword, hashPassword, encodeRef } = require('../utils/cryptoUtils');
const { validateEmail } = require('../middlewares/inputValidator');
const { setSessionCookie, clearSessionCookie } = require('../middlewares/sessionMiddleware');
const { recordLoginAttempt } = require('../middlewares/rateLimiter');

const DUMMY_HASH = '$pbkdf2-sha512$310000$pnk_salt_dummy_2026_asvs5$060a5048b3e86bd92ebc690a45f2cb01ba9de5e17f9f90d39b3854fa21b0ae65f9d59bb7da6883aadf9051cff1bb788cf9d4b0b1eacacc1d17117c8d2ab328b9';

class AuthController {
  static async obtenerSesion(req, res) {
    const restId = req.session?.restaurante_id || 1;
    return JsonView.success(res, {
      autenticado: Boolean(req.session?.usuario_id),
      usuario: req.session?.usuario_id
        ? { nombre: req.session.nombre_usuario }
        : null,
      restauranteRef: encodeRef('rest', restId),
      csrfToken: req.session?.csrf_token || null
    });
  }

  static async login(req, res, next) {
    try {
      const rawEmail = req.body?.email || req.body?.frmusuario || '';
      const rawPassword = String(req.body?.password || req.body?.frmpassword || '');
      const restauranteId = req.restauranteId || req.session?.restaurante_id || 1;
      const ip = req.ip || '0.0.0.0';

      const email = validateEmail(rawEmail);
      if (!email || !rawPassword || rawPassword.length > 128) {
        recordLoginAttempt(ip, rawEmail, false);
        return JsonView.error(res, 'Credenciales inválidas.', 401, 'AUTH_INVALID_CREDENTIALS');
      }

      const usuario = await UsuarioModel.buscarPorEmail(email);

      if (!usuario) {
        await verifyPassword(rawPassword, DUMMY_HASH);
        recordLoginAttempt(ip, email, false);
        await AuditoriaModel.registrar({
          evento: 'AUTH_LOGIN_FAILED_UNKNOWN_USER',
          severidad: 'WARN',
          ipAddress: ip,
          requestId: res.locals.requestId,
          detalles: { email }
        });
        return JsonView.error(res, 'Credenciales inválidas.', 401, 'AUTH_INVALID_CREDENTIALS');
      }

      if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta).getTime() > Date.now()) {
        await AuditoriaModel.registrar({
          evento: 'AUTH_ACCOUNT_LOCKED',
          severidad: 'WARN',
          usuarioId: usuario.id,
          ipAddress: ip,
          requestId: res.locals.requestId,
          detalles: { email, bloqueadoHasta: usuario.bloqueado_hasta }
        });
        return JsonView.error(res, 'Demasiados intentos fallidos. Intente nuevamente más tarde.', 429, 'AUTH_LOCKOUT');
      }

      const { valid, needsRehash } = await verifyPassword(rawPassword, usuario.password);
      const cuentaActiva = String(usuario.estado) === '1';

      if (!valid || !cuentaActiva) {
        await UsuarioModel.registrarIntentoFallido(usuario.id);
        recordLoginAttempt(ip, email, false);
        await AuditoriaModel.registrar({
          evento: 'AUTH_LOGIN_FAILED',
          severidad: 'WARN',
          usuarioId: usuario.id,
          ipAddress: ip,
          requestId: res.locals.requestId,
          detalles: { email }
        });
        return JsonView.error(res, 'Credenciales inválidas.', 401, 'AUTH_INVALID_CREDENTIALS');
      }

      if (needsRehash) {
        const nuevoHash = await hashPassword(rawPassword);
        await UsuarioModel.actualizarPasswordHash(usuario.id, nuevoHash);
      }

      await UsuarioModel.registrarLoginExitoso(usuario.id);
      recordLoginAttempt(ip, email, true);

      const nuevaSesion = await SesionModel.rotarEnLogin(req.session?.sid, {
        usuarioId: usuario.id,
        nombreUsuario: usuario.nombre,
        restauranteId,
        carritoPrevio: req.session?.carrito || {},
        ipAddress: ip,
        userAgent: req.headers['user-agent'] || ''
      });

      setSessionCookie(res, nuevaSesion.sid, req);

      await AuditoriaModel.registrar({
        evento: 'AUTH_LOGIN_SUCCESS',
        severidad: 'INFO',
        usuarioId: usuario.id,
        ipAddress: ip,
        requestId: res.locals.requestId,
        detalles: { email }
      });

      return JsonView.success(res, {
        autenticado: true,
        usuario: {
          nombre: usuario.nombre
        },
        restauranteRef: encodeRef('rest', restauranteId),
        csrfToken: nuevaSesion.csrf_token
      });
    } catch (err) {
      return next(err);
    }
  }

  static async logout(req, res, next) {
    try {
      const sid = req.session?.sid;
      const usuarioId = req.session?.usuario_id || null;
      const restauranteId = req.session?.restaurante_id || 1;
      const ip = req.ip || '0.0.0.0';

      if (sid) {
        await SesionModel.eliminar(sid);
      }
      clearSessionCookie(res, req);

      const sesionAnon = await SesionModel.crear({
        restauranteId,
        ipAddress: ip,
        userAgent: req.headers['user-agent'] || ''
      });
      setSessionCookie(res, sesionAnon.sid, req);

      await AuditoriaModel.registrar({
        evento: 'AUTH_LOGOUT_SUCCESS',
        severidad: 'INFO',
        usuarioId,
        ipAddress: ip,
        requestId: res.locals.requestId
      });

      return JsonView.success(res, {
        autenticado: false,
        restauranteRef: encodeRef('rest', restauranteId),
        csrfToken: sesionAnon.csrf_token
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = AuthController;
