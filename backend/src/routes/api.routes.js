'use strict';

const express = require('express');
const CartaController = require('../controllers/CartaController');
const AuthController = require('../controllers/AuthController');
const CarritoController = require('../controllers/CarritoController');
const ComentarioController = require('../controllers/ComentarioController');
const { sessionMiddleware, verifyCsrf, requireAuth } = require('../middlewares/sessionMiddleware');
const { checkLoginRateLimit } = require('../middlewares/rateLimiter');
const { validateRestauranteRef } = require('../middlewares/inputValidator');
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
router.use('/v1', sessionMiddleware);

// 1. Carta Digital (URL limpia sin ID o con referencia criptográfica ofuscada :ref)
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

module.exports = router;
