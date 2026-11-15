'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { PassThrough } = require('node:stream');

const app = require('../src/app');
const { encodeRef, decodeRef } = require('../src/utils/cryptoUtils');
const {
  validateRut,
  validateIntRange,
  validateBoolean,
  validateSafeFilename,
  validateFotoData,
  validateRolUsuario,
  validateEstadoUsuario,
  validatePassword,
  sanitizeText
} = require('../src/middlewares/inputValidator');
const { requireAdmin } = require('../src/middlewares/sessionMiddleware');
const SesionModel = require('../src/models/SesionModel');
const AuditoriaModel = require('../src/models/AuditoriaModel');
const RestauranteModel = require('../src/models/RestauranteModel');
const CartaController = require('../src/controllers/CartaController');
const AdminController = require('../src/controllers/AdminController');
const AdminModel = require('../src/models/AdminModel');
const db = require('../src/config/database');

// Valid 1x1 PNG magic bytes + base64
const VALID_PNG_DATA =
  'data:image/png;base64,' +
  Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
  ]).toString('base64');

// Valid JPEG magic bytes
const VALID_JPEG_DATA =
  'data:image/jpeg;base64,' +
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]).toString('base64');

// Valid WEBP magic bytes (RIFF....WEBP)
const VALID_WEBP_DATA =
  'data:image/webp;base64,' +
  Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1').toString('base64');

function requestApp(method, path, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new PassThrough();
    socket.remoteAddress = '127.0.0.1';
    socket.encrypted = false;

    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = path;

    const rawBody = body !== null ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8') : null;
    const normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }
    if (rawBody !== null) {
      normalizedHeaders['content-type'] = normalizedHeaders['content-type'] || 'application/json';
      normalizedHeaders['content-length'] = String(rawBody.length);
    }
    req.headers = normalizedHeaders;

    const res = new http.ServerResponse(req);
    const outSocket = new PassThrough();
    const chunks = [];
    outSocket.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    res.assignSocket(outSocket);

    res.on('finish', () => {
      const full = Buffer.concat(chunks).toString('utf8');
      const headerEnd = full.indexOf('\r\n\r\n');
      const bodyStr = headerEnd >= 0 ? full.slice(headerEnd + 4) : '';
      let json = null;
      try {
        json = JSON.parse(bodyStr);
      } catch {
        json = null;
      }
      const resHeaders = new Headers();
      for (const [k, v] of Object.entries(res.getHeaders())) {
        if (v !== undefined) {
          resHeaders.set(k, Array.isArray(v) ? v.join(', ') : String(v));
        }
      }
      resolve({ status: res.statusCode, headers: resHeaders, text: bodyStr, json });
    });

    res.on('error', reject);
    app(req, res);

    if (rawBody !== null) {
      req.push(rawBody);
    }
    req.push(null);
  });
}

test('Opaque tokens work across all 6 scopes and reject cross-scope or tampered tokens', () => {
  const scopes = ['rest', 'carta', 'cat', 'item', 'com', 'usr'];
  const tokens = {};
  for (const scope of scopes) {
    tokens[scope] = encodeRef(scope, 42);
    assert.ok(tokens[scope].length >= 24);
    assert.equal(decodeRef(scope, tokens[scope]), 42);
  }
  assert.equal(decodeRef('rest', tokens.carta), null);
  assert.equal(decodeRef('usr', tokens.item), null);
  assert.equal(decodeRef('rest', `${tokens.rest}tamper`), null);
});

test('Input validators enforce ASVS v5.0 Level 3 rules and magic bytes for fotoData', () => {
  assert.equal(validateRut('99887766-5'), '99887766-5');
  assert.equal(validateRut('258-3'), '258-3');
  assert.equal(validateRut('bad_rut'), null);

  assert.deepEqual(validateIntRange('1500', { min: 0 }), { ok: true, value: 1500 });
  assert.deepEqual(validateIntRange('-1', { min: 0 }), { ok: false, value: null });
  assert.deepEqual(validateIntRange(5, { min: 0, max: 5 }), { ok: true, value: 5 });
  assert.deepEqual(validateIntRange(6, { min: 0, max: 5 }), { ok: false, value: null });

  assert.equal(validateBoolean('true', false), true);
  assert.equal(validateBoolean('0', true), false);

  assert.deepEqual(validateSafeFilename('plato_1.jpg'), { ok: true, value: 'plato_1.jpg' });
  assert.deepEqual(validateSafeFilename('../etc/passwd'), { ok: false, value: null });

  assert.deepEqual(validateFotoData(undefined), { ok: true, provided: false, value: undefined });
  assert.deepEqual(validateFotoData(null), { ok: true, provided: true, value: null });
  assert.deepEqual(validateFotoData(''), { ok: true, provided: true, value: null });
  assert.equal(validateFotoData(VALID_PNG_DATA).ok, true);
  assert.equal(validateFotoData(VALID_JPEG_DATA).ok, true);
  assert.equal(validateFotoData(VALID_WEBP_DATA).ok, true);

  // Reject SVG or HTML disguised as PNG
  const fakeSvgPng = 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64');
  assert.equal(validateFotoData(fakeSvgPng).ok, false);
  assert.equal(validateFotoData('data:image/svg+xml;base64,PHN2Zz4=').ok, false);

  assert.equal(validateRolUsuario('admin'), 'admin');
  assert.equal(validateRolUsuario('superadmin'), null);
  assert.equal(validateEstadoUsuario('1'), '1');
  assert.equal(validateEstadoUsuario('2'), null);
  assert.equal(validatePassword('1234567', { required: true }).ok, false);
  assert.equal(validatePassword('Segura2026!', { required: true }).ok, true);
  assert.equal(sanitizeText('  Hola\x00Mundo  ', { min: 1, max: 50, required: true }).value, 'HolaMundo');
});

test('requireAdmin enforces authentication and admin role with audit logging', async (t) => {
  const origAuditoria = AuditoriaModel.registrar;
  const auditCalls = [];
  AuditoriaModel.registrar = async (entry) => {
    auditCalls.push(entry);
  };
  t.after(() => {
    AuditoriaModel.registrar = origAuditoria;
  });

  function makeRes() {
    const out = { statusCode: 200, body: null, locals: { requestId: 'req-test-1234' }, headers: {} };
    out.setHeader = (k, v) => {
      out.headers[k] = v;
    };
    out.status = (code) => {
      out.statusCode = code;
      return out;
    };
    out.json = (data) => {
      out.body = data;
      return out;
    };
    return out;
  }

  // Unauthenticated -> 403 AUTH_REQUIRED
  const resUnauth = makeRes();
  let nextCalled = false;
  await requireAdmin({ session: { usuario_id: null }, originalUrl: '/api/v1/admin/usuarios', method: 'GET' }, resUnauth, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(resUnauth.statusCode, 403);
  assert.equal(resUnauth.body.error.code, 'AUTH_REQUIRED');

  // Non-admin user -> 403 FORBIDDEN_ADMIN_ONLY + audit log
  const resUser = makeRes();
  await requireAdmin(
    { session: { usuario_id: 2, nombre_usuario: 'Alondra', rol: 'user' }, ip: '127.0.0.1', originalUrl: '/api/v1/admin/usuarios', method: 'GET' },
    resUser,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, false);
  assert.equal(resUser.statusCode, 403);
  assert.equal(resUser.body.error.code, 'FORBIDDEN_ADMIN_ONLY');
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].evento, 'AUTHZ_ADMIN_DENIED');

  // Admin user -> next()
  const resAdmin = makeRes();
  await requireAdmin(
    { session: { usuario_id: 1, nombre_usuario: 'Administrador', rol: 'admin' }, originalUrl: '/api/v1/admin/usuarios', method: 'GET' },
    resAdmin,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(nextCalled, true);
});

test('Express enforces 16kb payload limit on public routes, 512kb on /api/v1/admin, and PUT in CORS', async (t) => {
  const origObtenerValida = SesionModel.obtenerValida;
  const origCrear = SesionModel.crear;
  const origActualizarRest = SesionModel.actualizarRestaurante;
  const origListarUsuarios = AdminModel.listarUsuarios;
  const origAuditoria = AuditoriaModel.registrar;

  const validSid = 'a'.repeat(64);
  const validCsrf = 'b'.repeat(64);
  SesionModel.obtenerValida = async () => ({
    sid: validSid,
    usuario_id: 1,
    nombre_usuario: 'Administrador',
    rol: 'admin',
    restaurante_id: 1,
    csrf_token: validCsrf,
    carrito: {}
  });
  SesionModel.crear = async () => ({
    sid: validSid,
    usuario_id: null,
    nombre_usuario: null,
    rol: null,
    restaurante_id: 1,
    csrf_token: validCsrf,
    carrito: {}
  });
  SesionModel.actualizarRestaurante = async () => {};
  AdminModel.listarUsuarios = async () => [];
  AuditoriaModel.registrar = async () => {};

  t.after(() => {
    SesionModel.obtenerValida = origObtenerValida;
    SesionModel.crear = origCrear;
    SesionModel.actualizarRestaurante = origActualizarRest;
    AdminModel.listarUsuarios = origListarUsuarios;
    AuditoriaModel.registrar = origAuditoria;
  });

  // CORS preflight includes PUT and DELETE
  const corsRes = await requestApp('OPTIONS', '/api/v1/admin/restaurantes', {
    headers: {
      Origin: 'http://localhost:8080',
      'Access-Control-Request-Method': 'PUT'
    }
  });
  assert.equal(corsRes.status, 204);
  const allowedMethods = corsRes.headers.get('access-control-allow-methods') || '';
  assert.ok(allowedMethods.includes('PUT'));
  assert.ok(allowedMethods.includes('DELETE'));

  // Public route >16kb returns 413
  const oversizedPublic = { comentario: 'x'.repeat(20 * 1024) };
  const pubRes = await requestApp('POST', '/api/v1/comentarios', {
    headers: {
      Cookie: `pnk_sid=${validSid}`,
      'X-CSRF-Token': validCsrf
    },
    body: oversizedPublic
  });
  assert.equal(pubRes.status, 413);
  assert.equal(pubRes.json.error.code, 'PAYLOAD_TOO_LARGE');

  // Admin route 100kb passes JSON parser (and fails field validation with 400, NOT 413)
  const adminMedium = {
    rut: '99887766-5',
    nombre: 'Resto Test',
    fono: '123456',
    calle: 'Calle',
    numero: '10',
    comuna: 'La Serena',
    fotoData: 'data:image/png;base64,' + 'A'.repeat(100 * 1024)
  };
  const adminRes = await requestApp('POST', '/api/v1/admin/restaurantes', {
    headers: {
      Cookie: `pnk_sid=${validSid}`,
      'X-CSRF-Token': validCsrf
    },
    body: adminMedium
  });
  assert.equal(adminRes.status, 400);
  assert.equal(adminRes.json.error.code, 'INVALID_RESTAURANT_DATA');

  // Non-admin calling /api/v1/admin/usuarios gets 403 FORBIDDEN_ADMIN_ONLY
  SesionModel.obtenerValida = async () => ({
    sid: validSid,
    usuario_id: 2,
    nombre_usuario: 'Alondra',
    rol: 'user',
    restaurante_id: 1,
    csrf_token: validCsrf,
    carrito: {}
  });
  const nonAdminRes = await requestApp('GET', '/api/v1/admin/usuarios', {
    headers: { Cookie: `pnk_sid=${validSid}` }
  });
  assert.equal(nonAdminRes.status, 403);
  assert.equal(nonAdminRes.json.error.code, 'FORBIDDEN_ADMIN_ONLY');

  // Query ?id=1 is rejected everywhere in /api/v1
  const rawIdRes = await requestApp('GET', '/api/v1/restaurantes?id=1');
  assert.equal(rawIdRes.status, 400);
  assert.equal(rawIdRes.json.error.code, 'RAW_ID_IN_URL_FORBIDDEN');
});

test('Switching restaurant empties session cart in SesionModel.actualizarRestaurante and CartaController', async (t) => {
  const origDbQuery = db.query;
  const origObtenerPorId = RestauranteModel.obtenerPorId;
  const origListarActivos = RestauranteModel.listarActivos;
  const origDestacados = RestauranteModel.obtenerDestacados;
  const origEstructura = RestauranteModel.obtenerEstructuraCarta;
  const origComentarios = require('../src/models/ComentarioModel').listarPorRestaurante;

  const queries = [];
  db.query = async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [], rowCount: 1 };
  };

  await SesionModel.actualizarRestaurante('a'.repeat(64), 2);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /restaurante_id IS DISTINCT FROM \$2 THEN '\{\}'::jsonb ELSE carrito END/i);

  RestauranteModel.obtenerPorId = async (id) => ({
    id,
    nombre: `Resto ${id}`,
    calle: 'Calle',
    numero: '10',
    comuna: 'La Serena',
    region: 'Coquimbo',
    fono: '12345',
    email: 'test@correo.cl',
    foto: null,
    foto_data: VALID_PNG_DATA
  });
  RestauranteModel.listarActivos = async () => [
    { id: 1, nombre: 'Resto 1', comuna: 'La Serena', foto: 'resto1.jpg', foto_data: null },
    { id: 2, nombre: 'Resto 2', comuna: 'Coquimbo', foto: null, foto_data: VALID_PNG_DATA }
  ];
  RestauranteModel.obtenerDestacados = async () => [];
  RestauranteModel.obtenerEstructuraCarta = async () => [];
  require('../src/models/ComentarioModel').listarPorRestaurante = async () => [];

  t.after(() => {
    db.query = origDbQuery;
    RestauranteModel.obtenerPorId = origObtenerPorId;
    RestauranteModel.listarActivos = origListarActivos;
    RestauranteModel.obtenerDestacados = origDestacados;
    RestauranteModel.obtenerEstructuraCarta = origEstructura;
    require('../src/models/ComentarioModel').listarPorRestaurante = origComentarios;
  });

  const session = {
    sid: 'a'.repeat(64),
    usuario_id: 1,
    nombre_usuario: 'Administrador',
    rol: 'admin',
    restaurante_id: 1,
    carrito: { 5: { id: 5, nombre: 'Lomo', precio: 12500 } },
    csrf_token: 'b'.repeat(64)
  };
  let payload = null;
  const res = {
    locals: { requestId: 'req-1' },
    setHeader() {},
    status() {
      return this;
    },
    json(data) {
      payload = data;
      return this;
    }
  };

  await CartaController.seleccionarRestaurante(
    { body: { restauranteRef: encodeRef('rest', 2) }, headers: {}, session },
    res,
    (err) => {
      throw err;
    }
  );
  assert.equal(payload.ok, true);
  assert.equal(session.restaurante_id, 2);
  assert.deepEqual(session.carrito, {});

  await CartaController.obtenerCartaCompleta(
    { restauranteId: 2, explicitRestauranteRef: true, session },
    res,
    (err) => {
      throw err;
    }
  );
  assert.equal(payload.ok, true);
  assert.equal(payload.data.sesion.rol, 'admin');
  assert.equal(payload.data.restaurante.id, undefined);
  assert.equal(payload.data.restaurante.fotoUrl, VALID_PNG_DATA);
  assert.equal(payload.data.restaurantes.length, 2);
  assert.equal(payload.data.restaurantes[0].id, undefined);
  assert.ok(payload.data.restaurantes[0].fotoUrl.startsWith('media/'));
  assert.equal(payload.data.restaurantes[1].fotoUrl, VALID_PNG_DATA);
});

test('AdminController responses never expose raw numeric IDs', async (t) => {
  const origListarUsuarios = AdminModel.listarUsuarios;
  const origListarRestaurantes = AdminModel.listarRestaurantes;
  const origListarItems = AdminModel.listarItems;

  AdminModel.listarUsuarios = async () => [
    {
      id: 1,
      nombre: 'Administrador',
      email: 'admin@gmail.com',
      rol: 'admin',
      estado: '1',
      intentos_fallidos: 0,
      bloqueado_hasta: null,
      ultimo_acceso: null
    }
  ];
  AdminModel.listarRestaurantes = async () => [
    {
      id: 1,
      rut: '99887766-5',
      nombre: 'Africa Restobar',
      fono: '22334455',
      email: 'mail@correo.cl',
      mapa: null,
      foto: 'resto1.jpg',
      foto_data: null,
      calle: 'Av Argentina',
      numero: '951',
      comuna: 'La Serena',
      region: 'Coquimbo'
    }
  ];
  AdminModel.listarItems = async () => [
    {
      id: 5,
      categorias_id: 3,
      categoria_nombre: 'Carnes',
      carta_id: 4,
      carta_nombre: 'Principales',
      restaurantes_id: 1,
      nombre: 'Lomo a lo Pobre',
      descripcion: 'Lomo',
      observaciones: '',
      tiempo: '30m',
      precio: 12500,
      puntuacion: 5,
      visible: true,
      destacado: true,
      orden: 1,
      foto: 'item5.jpg',
      foto_data: null
    }
  ];

  t.after(() => {
    AdminModel.listarUsuarios = origListarUsuarios;
    AdminModel.listarRestaurantes = origListarRestaurantes;
    AdminModel.listarItems = origListarItems;
  });

  function captureRes() {
    let payload = null;
    return {
      res: {
        locals: { requestId: 'req-admin' },
        setHeader() {},
        status() {
          return this;
        },
        json(d) {
          payload = d;
          return this;
        }
      },
      get: () => payload
    };
  }

  const u = captureRes();
  await AdminController.listarUsuarios({}, u.res, (e) => {
    throw e;
  });
  assert.equal(u.get().data.usuarios[0].id, undefined);
  assert.equal(u.get().data.usuarios[0].password, undefined);
  assert.equal(decodeRef('usr', u.get().data.usuarios[0].usuarioToken), 1);

  const r = captureRes();
  await AdminController.listarRestaurantes({}, r.res, (e) => {
    throw e;
  });
  assert.equal(r.get().data.restaurantes[0].id, undefined);
  assert.equal(decodeRef('rest', r.get().data.restaurantes[0].ref), 1);

  const it = captureRes();
  await AdminController.listarItems({ query: {}, headers: {}, session: { restaurante_id: 1 } }, it.res, (e) => {
    throw e;
  });
  assert.equal(it.get().data.items[0].id, undefined);
  assert.equal(decodeRef('item', it.get().data.items[0].itemToken), 5);
  assert.equal(decodeRef('cat', it.get().data.items[0].categoriaToken), 3);
  assert.equal(decodeRef('carta', it.get().data.items[0].cartaToken), 4);
});
