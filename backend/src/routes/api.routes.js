'use strict';

const express = require('express');
const CartaController = require('../controllers/CartaController');
const AuthController = require('../controllers/AuthController');
const CarritoController = require('../controllers/CarritoController');
const ComentarioController = require('../controllers/ComentarioController');
const AdminController = require('../controllers/AdminController');
const { sessionMiddleware, verifyCsrf, requireAuth, requireAdmin } = require('../middlewares/sessionMiddleware');
const { checkLoginRateLimit } = require('../middlewares/rateLimiter');
const { rejectRawIdsInQuery, validateRestauranteRef } = require('../middlewares/inputValidator');
const { decodeRef } = require('../utils/cryptoUtils');
const db = require('../config/database');
const JsonView = require('../views/JsonView');

const router = express.Router();

// Endpoint de salud para Docker, Cloudflare y QA IA
router.get('/health', async (req, res) => {
  try {
    const dbOk = await db.checkHealth();
    if (!dbOk) {
      return JsonView.error(res, 'Database unhealthy', 503, 'DB_UNHEALTHY');
    }
    return JsonView.success(res, {
      status: 'healthy',
      service: 'pnk-carta-digital-backend',
      asvsVersion: '5.0-L3',
      urlObfuscation: 'enabled',
      timestamp: new Date().toISOString()
    });
  } catch {
    return JsonView.error(res, 'Service unavailable', 503, 'SERVICE_UNAVAILABLE');
  }
});

// Resolución interna de token de media para que el servidor Front-End sirva imágenes sin exponer 'cod1'
router.get('/internal/media-resolve/:restRef', (req, res) => {
  const idRest = decodeRef('rest', req.params.restRef);
  if (!idRest) {
    return JsonView.error(res, 'Referencia de imagen inválida', 400, 'INVALID_MEDIA_REF');
  }
  return JsonView.success(res, { folder: `cod${idRest}` });
});

// Rutas v1 con gestión de sesión en PostgreSQL y URLs sin IDs expuestos
router.use('/v1', rejectRawIdsInQuery, sessionMiddleware);

// 1. Selector de Restaurantes y Carta Digital (URL limpia sin ID o con referencia criptográfica ofuscada :ref)
router.get('/v1/restaurantes', CartaController.listarRestaurantes);
router.post('/v1/restaurantes/seleccionar', verifyCsrf, CartaController.seleccionarRestaurante);
router.get('/v1/carta', validateRestauranteRef, CartaController.obtenerCartaCompleta);
router.get('/v1/carta/:ref', validateRestauranteRef, CartaController.obtenerCartaCompleta);

// 2. Autenticación y Sesiones
router.get('/v1/auth/session', AuthController.obtenerSesion);
router.post('/v1/auth/login', checkLoginRateLimit, verifyCsrf, validateRestauranteRef, AuthController.login);
router.post('/v1/auth/logout', verifyCsrf, AuthController.logout);

// 3. Carrito de Productos (usa itemToken ofuscado y restaurante de la sesión, nunca expone ?keyid= ni id=)
router.get('/v1/carrito', validateRestauranteRef, CarritoController.obtenerCarrito);
router.post('/v1/carrito/items', verifyCsrf, validateRestauranteRef, CarritoController.agregarItem);
router.delete('/v1/carrito/items/:itemToken', verifyCsrf, validateRestauranteRef, CarritoController.eliminarItem);
router.delete('/v1/carrito', verifyCsrf, CarritoController.vaciarCarrito);

// 4. Comentarios (vinculado a la sesión y referencia ofuscada, sin ID en la URL)
router.post('/v1/comentarios', requireAuth, verifyCsrf, validateRestauranteRef, ComentarioController.crearComentario);

// 5. Panel CRUD Administrativo (OWASP ASVS v5.0 Level 3: RBAC admin + CSRF + Tokens opacos)
router.use('/v1/admin', requireAuth, requireAdmin, verifyCsrf);

router.get('/v1/admin/restaurantes', AdminController.listarRestaurantes);
router.post('/v1/admin/restaurantes', AdminController.crearRestaurante);
router.put('/v1/admin/restaurantes/:ref', AdminController.actualizarRestaurante);
router.delete('/v1/admin/restaurantes/:ref', AdminController.eliminarRestaurante);

router.get('/v1/admin/cartas', AdminController.listarCartas);
router.post('/v1/admin/cartas', AdminController.crearCarta);
router.put('/v1/admin/cartas/:cartaToken', AdminController.actualizarCarta);
router.delete('/v1/admin/cartas/:cartaToken', AdminController.eliminarCarta);

router.get('/v1/admin/categorias', AdminController.listarCategorias);
router.post('/v1/admin/categorias', AdminController.crearCategoria);
router.put('/v1/admin/categorias/:categoriaToken', AdminController.actualizarCategoria);
router.delete('/v1/admin/categorias/:categoriaToken', AdminController.eliminarCategoria);

router.get('/v1/admin/items', AdminController.listarItems);
router.post('/v1/admin/items', AdminController.crearItem);
router.put('/v1/admin/items/:itemToken', AdminController.actualizarItem);
router.delete('/v1/admin/items/:itemToken', AdminController.eliminarItem);

router.get('/v1/admin/comentarios', AdminController.listarComentarios);
router.put('/v1/admin/comentarios/:comentarioToken', AdminController.actualizarComentario);
router.delete('/v1/admin/comentarios/:comentarioToken', AdminController.eliminarComentario);

router.get('/v1/admin/usuarios', AdminController.listarUsuarios);
router.post('/v1/admin/usuarios', AdminController.crearUsuario);
router.put('/v1/admin/usuarios/:usuarioToken', AdminController.actualizarUsuario);
router.delete('/v1/admin/usuarios/:usuarioToken', AdminController.eliminarUsuario);

module.exports = router;
