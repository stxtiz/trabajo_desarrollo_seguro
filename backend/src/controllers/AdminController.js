'use strict';

const AdminModel = require('../models/AdminModel');
const AuditoriaModel = require('../models/AuditoriaModel');
const RestauranteModel = require('../models/RestauranteModel');
const SesionModel = require('../models/SesionModel');
const UsuarioModel = require('../models/UsuarioModel');
const JsonView = require('../views/JsonView');
const { encodeRef, decodeRef, hashPassword } = require('../utils/cryptoUtils');
const {
  parsePositiveInt,
  validateEmail,
  sanitizeText,
  validateComentarioText,
  validateRut,
  validateIntRange,
  validateBoolean,
  validateSafeFilename,
  validateFotoData,
  validateRolUsuario,
  validateEstadoUsuario,
  validatePassword
} = require('../middlewares/inputValidator');

function resolveRestIdFromRequest(req, { allowBody = false } = {}) {
  const explicitRaw = req.query.restRef ?? (allowBody ? req.body?.restRef : undefined) ?? req.headers['x-carta-ref'];
  if (explicitRaw !== undefined && explicitRaw !== null && String(explicitRaw).trim() !== '') {
    const id = decodeRef('rest', String(explicitRaw).trim());
    if (!id) {
      return { ok: false, id: null };
    }
    return { ok: true, id };
  }
  return { ok: true, id: parsePositiveInt(req.session?.restaurante_id) || 1 };
}

async function auditMutation(req, res, evento, detalles = {}) {
  await AuditoriaModel.registrar({
    evento,
    severidad: 'INFO',
    usuarioId: req.session?.usuario_id || null,
    ipAddress: req.ip || '0.0.0.0',
    requestId: res.locals.requestId,
    detalles
  });
}

function formatRestaurante(r) {
  const ref = encodeRef('rest', r.id);
  return {
    ref,
    rut: r.rut,
    nombre: r.nombre,
    fono: r.fono,
    email: r.email || '',
    mapa: r.mapa || '',
    foto: r.foto || '',
    hasFotoData: Boolean(r.foto_data),
    fotoUrl: RestauranteModel.resolveFotoUrl(ref, r.foto, r.foto_data),
    calle: r.calle,
    numero: r.numero,
    comuna: r.comuna,
    region: r.region || ''
  };
}

function formatCarta(c) {
  const restRef = encodeRef('rest', c.restaurantes_id);
  return {
    cartaToken: encodeRef('carta', c.id),
    restRef,
    nombre: c.nombre || '',
    orden: c.orden ?? null,
    visible: Boolean(c.visible),
    foto: c.foto || '',
    hasFotoData: Boolean(c.foto_data),
    fotoUrl: RestauranteModel.resolveFotoUrl(restRef, c.foto, c.foto_data)
  };
}

function formatCategoria(cat) {
  const restRef = encodeRef('rest', cat.restaurantes_id);
  return {
    categoriaToken: encodeRef('cat', cat.id),
    cartaToken: encodeRef('carta', cat.cartas_id),
    cartaNombre: cat.carta_nombre || '',
    restRef,
    nombre: cat.nombre,
    orden: cat.orden ?? null,
    visible: Boolean(cat.visible),
    foto: cat.foto || '',
    hasFotoData: Boolean(cat.foto_data),
    fotoUrl: RestauranteModel.resolveFotoUrl(restRef, cat.foto, cat.foto_data)
  };
}

function formatItem(i) {
  const restRef = encodeRef('rest', i.restaurantes_id);
  return {
    itemToken: encodeRef('item', i.id),
    categoriaToken: encodeRef('cat', i.categorias_id),
    categoriaNombre: i.categoria_nombre || '',
    cartaToken: encodeRef('carta', i.carta_id),
    cartaNombre: i.carta_nombre || '',
    restRef,
    nombre: i.nombre,
    descripcion: i.descripcion || '',
    observaciones: i.observaciones || '',
    tiempo: i.tiempo || '',
    precio: Number(i.precio),
    puntuacion: Number(i.puntuacion),
    visible: Boolean(i.visible),
    destacado: Boolean(i.destacado),
    orden: i.orden ?? null,
    foto: i.foto || '',
    hasFotoData: Boolean(i.foto_data),
    fotoUrl: RestauranteModel.resolveFotoUrl(restRef, i.foto, i.foto_data)
  };
}

function formatComentario(c) {
  return {
    comentarioToken: encodeRef('com', c.id),
    restRef: encodeRef('rest', c.id_restaurante),
    usuario: c.usuario,
    comentario: c.comentario,
    creado: c.creado
  };
}

function formatUsuario(u) {
  return {
    usuarioToken: encodeRef('usr', u.id),
    nombre: u.nombre,
    email: u.email,
    rol: UsuarioModel.resolveRol(u),
    estado: String(u.estado),
    intentosFallidos: Number(u.intentos_fallidos || 0),
    bloqueadoHasta: u.bloqueado_hasta || null,
    ultimoAcceso: u.ultimo_acceso || null
  };
}

function parseMediaFields(body) {
  const foto = validateSafeFilename(body?.foto);
  if (!foto.ok) {
    return { error: 'Nombre de archivo de imagen inválido (solo caracteres alfanuméricos, ".", "_" o "-").' };
  }

  const fotoData = validateFotoData(body?.fotoData);
  if (!fotoData.ok) {
    return { error: 'Imagen base64 inválida o supera el tamaño permitido (~250KB PNG/JPEG/WEBP).' };
  }

  return {
    foto: foto.value,
    fotoDataProvided: fotoData.provided,
    fotoData: fotoData.value
  };
}

function parseRestaurantePayload(body) {
  const rut = validateRut(body?.rut);
  if (!rut) return { error: 'RUT inválido (ejemplo: 99887766-5).' };

  const nombre = sanitizeText(body?.nombre, { min: 2, max: 200, required: true });
  if (!nombre.ok) return { error: 'Nombre de restaurante inválido (2-200 caracteres).' };

  const fono = sanitizeText(body?.fono, { min: 3, max: 45, required: true });
  if (!fono.ok) return { error: 'Teléfono inválido (3-45 caracteres).' };

  let emailVal = null;
  if (body?.email !== undefined && body?.email !== null && String(body.email).trim() !== '') {
    emailVal = validateEmail(body.email);
    if (!emailVal) return { error: 'Correo electrónico inválido.' };
  }

  const mapa = sanitizeText(body?.mapa, { min: 0, max: 200, required: false });
  if (!mapa.ok) return { error: 'Campo mapa excede 200 caracteres.' };

  const calle = sanitizeText(body?.calle, { min: 2, max: 100, required: true });
  if (!calle.ok) return { error: 'Calle inválida (2-100 caracteres).' };

  const numero = sanitizeText(body?.numero, { min: 1, max: 15, required: true });
  if (!numero.ok) return { error: 'Número de dirección inválido (1-15 caracteres).' };

  const comuna = sanitizeText(body?.comuna, { min: 2, max: 100, required: true });
  if (!comuna.ok) return { error: 'Comuna inválida (2-100 caracteres).' };

  const region = sanitizeText(body?.region, { min: 0, max: 100, required: false });
  if (!region.ok) return { error: 'Región excede 100 caracteres.' };

  const media = parseMediaFields(body);
  if (media.error) return { error: media.error };

  return {
    data: {
      rut,
      nombre: nombre.value,
      fono: fono.value,
      email: emailVal,
      mapa: mapa.value,
      calle: calle.value,
      numero: numero.value,
      comuna: comuna.value,
      region: region.value,
      ...media
    }
  };
}

function parseCartaPayload(body) {
  const nombre = sanitizeText(body?.nombre, { min: 1, max: 45, required: true });
  if (!nombre.ok) return { error: 'Nombre de carta inválido (1-45 caracteres).' };

  const orden = validateIntRange(body?.orden, { min: 0, max: 10000, allowNull: true, defaultValue: null });
  if (!orden.ok) return { error: 'Orden inválido (entero >= 0).' };

  const visible = validateBoolean(body?.visible, true);
  const media = parseMediaFields(body);
  if (media.error) return { error: media.error };

  return {
    data: {
      nombre: nombre.value,
      orden: orden.value,
      visible,
      ...media
    }
  };
}

function parseCategoriaPayload(body, { requireCartaToken = true } = {}) {
  let idCarta = null;
  if (body?.cartaToken !== undefined && body?.cartaToken !== null && String(body.cartaToken).trim() !== '') {
    idCarta = decodeRef('carta', String(body.cartaToken).trim());
    if (!idCarta) return { error: 'Token de carta inválido.' };
  } else if (requireCartaToken) {
    return { error: 'Debe seleccionar una carta.' };
  }

  const nombre = sanitizeText(body?.nombre, { min: 1, max: 100, required: true });
  if (!nombre.ok) return { error: 'Nombre de categoría inválido (1-100 caracteres).' };

  const orden = validateIntRange(body?.orden, { min: 0, max: 10000, allowNull: true, defaultValue: null });
  if (!orden.ok) return { error: 'Orden inválido (entero >= 0).' };

  const visible = validateBoolean(body?.visible, true);
  const media = parseMediaFields(body);
  if (media.error) return { error: media.error };

  return {
    data: {
      idCarta,
      nombre: nombre.value,
      orden: orden.value,
      visible,
      ...media
    }
  };
}

function parseItemPayload(body, { requireCategoriaToken = true } = {}) {
  let idCategoria = null;
  if (body?.categoriaToken !== undefined && body?.categoriaToken !== null && String(body.categoriaToken).trim() !== '') {
    idCategoria = decodeRef('cat', String(body.categoriaToken).trim());
    if (!idCategoria) return { error: 'Token de categoría inválido.' };
  } else if (requireCategoriaToken) {
    return { error: 'Debe seleccionar una categoría.' };
  }

  const nombre = sanitizeText(body?.nombre, { min: 1, max: 100, required: true });
  if (!nombre.ok) return { error: 'Nombre de ítem inválido (1-100 caracteres).' };

  const descripcion = sanitizeText(body?.descripcion, { min: 0, max: 300, required: false });
  if (!descripcion.ok) return { error: 'Descripción excede 300 caracteres.' };

  const observaciones = sanitizeText(body?.observaciones, { min: 0, max: 300, required: false });
  if (!observaciones.ok) return { error: 'Observaciones exceden 300 caracteres.' };

  const tiempo = sanitizeText(body?.tiempo, { min: 0, max: 100, required: false });
  if (!tiempo.ok) return { error: 'Tiempo de preparación excede 100 caracteres.' };

  const precio = validateIntRange(body?.precio, { min: 0, max: 100000000, allowNull: false });
  if (!precio.ok) return { error: 'Precio inválido (debe ser un entero >= 0).' };

  const puntuacion = validateIntRange(body?.puntuacion, { min: 0, max: 5, allowNull: true, defaultValue: 0 });
  if (!puntuacion.ok) return { error: 'Puntuación inválida (debe ser un entero entre 0 y 5).' };

  const orden = validateIntRange(body?.orden, { min: 0, max: 10000, allowNull: true, defaultValue: null });
  if (!orden.ok) return { error: 'Orden inválido (entero >= 0).' };

  const visible = validateBoolean(body?.visible, true);
  const destacado = validateBoolean(body?.destacado, false);
  const media = parseMediaFields(body);
  if (media.error) return { error: media.error };

  return {
    data: {
      idCategoria,
      nombre: nombre.value,
      descripcion: descripcion.value,
      observaciones: observaciones.value,
      tiempo: tiempo.value,
      precio: precio.value,
      puntuacion: puntuacion.value,
      visible,
      destacado,
      orden: orden.value,
      ...media
    }
  };
}

function parseUsuarioPayload(body, { passwordRequired = true } = {}) {
  const nombre = sanitizeText(body?.nombre, { min: 2, max: 255, required: true });
  if (!nombre.ok) return { error: 'Nombre de usuario inválido (2-255 caracteres).', code: 'INVALID_USER_DATA' };

  const email = validateEmail(body?.email);
  if (!email) return { error: 'Correo electrónico inválido.', code: 'INVALID_USER_DATA' };

  const password = validatePassword(body?.password, { required: passwordRequired });
  if (!password.ok) return { error: 'La contraseña debe tener entre 8 y 128 caracteres.', code: 'INVALID_PASSWORD' };

  const rol = validateRolUsuario(body?.rol || 'user');
  if (!rol) return { error: 'Rol inválido (permitidos: admin, user).', code: 'INVALID_USER_ROLE' };

  const estado = validateEstadoUsuario(body?.estado ?? '1');
  if (!estado) return { error: 'Estado inválido (permitidos: 1, 0).', code: 'INVALID_USER_STATE' };

  return {
    data: {
      nombre: nombre.value,
      email,
      password,
      rol,
      estado
    }
  };
}

class AdminController {
  // ==================== RESTAURANTES ====================

  static async listarRestaurantes(req, res, next) {
    try {
      const rows = await AdminModel.listarRestaurantes();
      return JsonView.success(res, {
        restaurantes: rows.map(formatRestaurante)
      });
    } catch (err) {
      return next(err);
    }
  }

  static async crearRestaurante(req, res, next) {
    try {
      const parsed = parseRestaurantePayload(req.body);
      if (parsed.error) {
        return JsonView.error(res, parsed.error, 400, 'INVALID_RESTAURANT_DATA');
      }

      const created = await AdminModel.crearRestaurante(parsed.data);
      await auditMutation(req, res, 'ADMIN_RESTAURANT_CREATED', { restauranteId: created.id, nombre: created.nombre });

      return JsonView.success(
        res,
        {
          restaurante: formatRestaurante(created),
          mensaje: 'Restaurante creado correctamente.'
        },
        201
      );
    } catch (err) {
      return next(err);
    }
  }

  static async actualizarRestaurante(req, res, next) {
    try {
      const idRestaurante = decodeRef('rest', req.params.ref);
      if (!idRestaurante) {
        return JsonView.error(res, 'Referencia opaca de restaurante inválida.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const parsed = parseRestaurantePayload(req.body);
      if (parsed.error) {
        return JsonView.error(res, parsed.error, 400, 'INVALID_RESTAURANT_DATA');
      }

      const updated = await AdminModel.actualizarRestaurante(idRestaurante, parsed.data);
      if (!updated) {
        return JsonView.error(res, 'Restaurante no encontrado.', 404, 'RESTAURANT_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_RESTAURANT_UPDATED', { restauranteId: idRestaurante, nombre: updated.nombre });

      return JsonView.success(res, {
        restaurante: formatRestaurante(updated),
        mensaje: 'Restaurante actualizado correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  static async eliminarRestaurante(req, res, next) {
    try {
      const idRestaurante = decodeRef('rest', req.params.ref);
      if (!idRestaurante) {
        return JsonView.error(res, 'Referencia opaca de restaurante inválida.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const result = await AdminModel.eliminarRestaurante(idRestaurante);
      if (result.status === 'NOT_FOUND') {
        return JsonView.error(res, 'Restaurante no encontrado.', 404, 'RESTAURANT_NOT_FOUND');
      }
      if (result.status === 'LAST_RESTAURANT') {
        return JsonView.error(res, 'No se puede eliminar el último restaurante activo.', 400, 'LAST_RESTAURANT_CANNOT_DELETE');
      }

      if (req.session && Number(req.session.restaurante_id) === Number(idRestaurante) && result.fallbackRestauranteId) {
        await SesionModel.actualizarRestaurante(req.session.sid, result.fallbackRestauranteId);
        req.session.restaurante_id = result.fallbackRestauranteId;
        req.session.carrito = {};
      }

      await auditMutation(req, res, 'ADMIN_RESTAURANT_DELETED', { restauranteId: idRestaurante });

      return JsonView.success(res, {
        mensaje: 'Restaurante eliminado correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  // ==================== CARTAS ====================

  static async listarCartas(req, res, next) {
    try {
      const rest = resolveRestIdFromRequest(req);
      if (!rest.ok) {
        return JsonView.error(res, 'Referencia opaca de restaurante inválida.', 400, 'INVALID_OBFUSCATED_REF');
      }
      const rows = await AdminModel.listarCartas(rest.id);
      return JsonView.success(res, {
        cartas: rows.map(formatCarta)
      });
    } catch (err) {
      return next(err);
    }
  }

  static async crearCarta(req, res, next) {
    try {
      const rest = resolveRestIdFromRequest(req, { allowBody: true });
      if (!rest.ok) {
        return JsonView.error(res, 'Referencia opaca de restaurante inválida.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const parsed = parseCartaPayload(req.body);
      if (parsed.error) {
        return JsonView.error(res, parsed.error, 400, 'INVALID_CARTA_DATA');
      }

      const created = await AdminModel.crearCarta({
        idRestaurante: rest.id,
        ...parsed.data
      });
      if (!created) {
        return JsonView.error(res, 'Restaurante no encontrado.', 404, 'RESTAURANT_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_CARTA_CREATED', { cartaId: created.id, restauranteId: rest.id });

      return JsonView.success(
        res,
        {
          carta: formatCarta(created),
          mensaje: 'Carta creada correctamente.'
        },
        201
      );
    } catch (err) {
      return next(err);
    }
  }

  static async actualizarCarta(req, res, next) {
    try {
      const idCarta = decodeRef('carta', req.params.cartaToken);
      if (!idCarta) {
        return JsonView.error(res, 'Token de carta inválido.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const parsed = parseCartaPayload(req.body);
      if (parsed.error) {
        return JsonView.error(res, parsed.error, 400, 'INVALID_CARTA_DATA');
      }

      const updated = await AdminModel.actualizarCarta(idCarta, parsed.data);
      if (!updated) {
        return JsonView.error(res, 'Carta no encontrada.', 404, 'CARTA_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_CARTA_UPDATED', { cartaId: idCarta });

      return JsonView.success(res, {
        carta: formatCarta(updated),
        mensaje: 'Carta actualizada correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  static async eliminarCarta(req, res, next) {
    try {
      const idCarta = decodeRef('carta', req.params.cartaToken);
      if (!idCarta) {
        return JsonView.error(res, 'Token de carta inválido.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const deleted = await AdminModel.eliminarCarta(idCarta);
      if (!deleted) {
        return JsonView.error(res, 'Carta no encontrada.', 404, 'CARTA_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_CARTA_DELETED', { cartaId: idCarta });

      return JsonView.success(res, {
        mensaje: 'Carta eliminada correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  // ==================== CATEGORIAS ====================

  static async listarCategorias(req, res, next) {
    try {
      const rest = resolveRestIdFromRequest(req);
      if (!rest.ok) {
        return JsonView.error(res, 'Referencia opaca de restaurante inválida.', 400, 'INVALID_OBFUSCATED_REF');
      }

      let idCarta = null;
      if (req.query.cartaToken !== undefined && String(req.query.cartaToken).trim() !== '') {
        idCarta = decodeRef('carta', String(req.query.cartaToken).trim());
        if (!idCarta) {
          return JsonView.error(res, 'Token de carta inválido.', 400, 'INVALID_OBFUSCATED_REF');
        }
      }

      const rows = await AdminModel.listarCategorias({ idRestaurante: rest.id, idCarta });
      return JsonView.success(res, {
        categorias: rows.map(formatCategoria)
      });
    } catch (err) {
      return next(err);
    }
  }

  static async crearCategoria(req, res, next) {
    try {
      const parsed = parseCategoriaPayload(req.body, { requireCartaToken: true });
      if (parsed.error) {
        return JsonView.error(res, parsed.error, 400, 'INVALID_CATEGORY_DATA');
      }

      const created = await AdminModel.crearCategoria(parsed.data);
      if (!created) {
        return JsonView.error(res, 'Carta no encontrada.', 404, 'CARTA_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_CATEGORY_CREATED', { categoriaId: created.id, cartaId: created.cartas_id });

      return JsonView.success(
        res,
        {
          categoria: formatCategoria(created),
          mensaje: 'Categoría creada correctamente.'
        },
        201
      );
    } catch (err) {
      return next(err);
    }
  }

  static async actualizarCategoria(req, res, next) {
    try {
      const idCategoria = decodeRef('cat', req.params.categoriaToken);
      if (!idCategoria) {
        return JsonView.error(res, 'Token de categoría inválido.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const parsed = parseCategoriaPayload(req.body, { requireCartaToken: false });
      if (parsed.error) {
        return JsonView.error(res, parsed.error, 400, 'INVALID_CATEGORY_DATA');
      }

      const updated = await AdminModel.actualizarCategoria(idCategoria, parsed.data);
      if (updated?.error === 'CARTA_NOT_FOUND') {
        return JsonView.error(res, 'Carta destino no encontrada.', 404, 'CARTA_NOT_FOUND');
      }
      if (!updated) {
        return JsonView.error(res, 'Categoría no encontrada.', 404, 'CATEGORY_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_CATEGORY_UPDATED', { categoriaId: idCategoria });

      return JsonView.success(res, {
        categoria: formatCategoria(updated),
        mensaje: 'Categoría actualizada correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  static async eliminarCategoria(req, res, next) {
    try {
      const idCategoria = decodeRef('cat', req.params.categoriaToken);
      if (!idCategoria) {
        return JsonView.error(res, 'Token de categoría inválido.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const deleted = await AdminModel.eliminarCategoria(idCategoria);
      if (!deleted) {
        return JsonView.error(res, 'Categoría no encontrada.', 404, 'CATEGORY_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_CATEGORY_DELETED', { categoriaId: idCategoria });

      return JsonView.success(res, {
        mensaje: 'Categoría eliminada correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  // ==================== ITEMS ====================

  static async listarItems(req, res, next) {
    try {
      const rest = resolveRestIdFromRequest(req);
      if (!rest.ok) {
        return JsonView.error(res, 'Referencia opaca de restaurante inválida.', 400, 'INVALID_OBFUSCATED_REF');
      }
      const rows = await AdminModel.listarItems(rest.id);
      return JsonView.success(res, {
        items: rows.map(formatItem)
      });
    } catch (err) {
      return next(err);
    }
  }

  static async crearItem(req, res, next) {
    try {
      const parsed = parseItemPayload(req.body, { requireCategoriaToken: true });
      if (parsed.error) {
        return JsonView.error(res, parsed.error, 400, 'INVALID_ITEM_DATA');
      }

      const created = await AdminModel.crearItem(parsed.data);
      if (!created) {
        return JsonView.error(res, 'Categoría no encontrada.', 404, 'CATEGORY_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_ITEM_CREATED', { itemId: created.id, categoriaId: created.categorias_id });

      return JsonView.success(
        res,
        {
          item: formatItem(created),
          mensaje: 'Ítem creado correctamente.'
        },
        201
      );
    } catch (err) {
      return next(err);
    }
  }

  static async actualizarItem(req, res, next) {
    try {
      const idItem = decodeRef('item', req.params.itemToken);
      if (!idItem) {
        return JsonView.error(res, 'Token de ítem inválido.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const parsed = parseItemPayload(req.body, { requireCategoriaToken: false });
      if (parsed.error) {
        return JsonView.error(res, parsed.error, 400, 'INVALID_ITEM_DATA');
      }

      const updated = await AdminModel.actualizarItem(idItem, parsed.data);
      if (updated?.error === 'CATEGORY_NOT_FOUND') {
        return JsonView.error(res, 'Categoría destino no encontrada.', 404, 'CATEGORY_NOT_FOUND');
      }
      if (!updated) {
        return JsonView.error(res, 'Ítem no encontrado.', 404, 'ITEM_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_ITEM_UPDATED', { itemId: idItem });

      return JsonView.success(res, {
        item: formatItem(updated),
        mensaje: 'Ítem actualizado correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  static async eliminarItem(req, res, next) {
    try {
      const idItem = decodeRef('item', req.params.itemToken);
      if (!idItem) {
        return JsonView.error(res, 'Token de ítem inválido.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const deleted = await AdminModel.eliminarItem(idItem);
      if (!deleted) {
        return JsonView.error(res, 'Ítem no encontrado.', 404, 'ITEM_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_ITEM_DELETED', { itemId: idItem });

      return JsonView.success(res, {
        mensaje: 'Ítem eliminado correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  // ==================== COMENTARIOS ====================

  static async listarComentarios(req, res, next) {
    try {
      const rest = resolveRestIdFromRequest(req);
      if (!rest.ok) {
        return JsonView.error(res, 'Referencia opaca de restaurante inválida.', 400, 'INVALID_OBFUSCATED_REF');
      }
      const rows = await AdminModel.listarComentarios(rest.id);
      return JsonView.success(res, {
        comentarios: rows.map(formatComentario)
      });
    } catch (err) {
      return next(err);
    }
  }

  static async actualizarComentario(req, res, next) {
    try {
      const idComentario = decodeRef('com', req.params.comentarioToken);
      if (!idComentario) {
        return JsonView.error(res, 'Token de comentario inválido.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const comentario = validateComentarioText(req.body?.comentario);
      if (!comentario) {
        return JsonView.error(res, 'Texto de comentario inválido (1-1000 caracteres).', 400, 'INVALID_COMMENT_DATA');
      }

      const updated = await AdminModel.actualizarComentario(idComentario, comentario);
      if (!updated) {
        return JsonView.error(res, 'Comentario no encontrado.', 404, 'COMMENT_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_COMMENT_UPDATED', { comentarioId: idComentario });

      return JsonView.success(res, {
        comentario: formatComentario(updated),
        mensaje: 'Comentario actualizado correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  static async eliminarComentario(req, res, next) {
    try {
      const idComentario = decodeRef('com', req.params.comentarioToken);
      if (!idComentario) {
        return JsonView.error(res, 'Token de comentario inválido.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const deleted = await AdminModel.eliminarComentario(idComentario);
      if (!deleted) {
        return JsonView.error(res, 'Comentario no encontrado.', 404, 'COMMENT_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_COMMENT_DELETED', { comentarioId: idComentario });

      return JsonView.success(res, {
        mensaje: 'Comentario eliminado correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  // ==================== USUARIOS ====================

  static async listarUsuarios(req, res, next) {
    try {
      const rows = await AdminModel.listarUsuarios();
      return JsonView.success(res, {
        usuarios: rows.map(formatUsuario)
      });
    } catch (err) {
      return next(err);
    }
  }

  static async crearUsuario(req, res, next) {
    try {
      const parsed = parseUsuarioPayload(req.body, { passwordRequired: true });
      if (parsed.error) {
        return JsonView.error(res, parsed.error, 400, parsed.code);
      }

      const { nombre, email, password, rol, estado } = parsed.data;
      const passwordHash = await hashPassword(password.value);
      const created = await AdminModel.crearUsuario({
        nombre,
        email,
        passwordHash,
        rol,
        estado
      });

      if (created?.error === 'EMAIL_EXISTS') {
        return JsonView.error(res, 'Ya existe un usuario registrado con ese correo electrónico.', 409, 'EMAIL_ALREADY_EXISTS');
      }

      await auditMutation(req, res, 'ADMIN_USER_CREATED', { targetUsuarioId: created.id, email, rol });

      return JsonView.success(
        res,
        {
          usuario: formatUsuario(created),
          mensaje: 'Usuario creado correctamente.'
        },
        201
      );
    } catch (err) {
      return next(err);
    }
  }

  static async actualizarUsuario(req, res, next) {
    try {
      const idUsuario = decodeRef('usr', req.params.usuarioToken);
      if (!idUsuario) {
        return JsonView.error(res, 'Token de usuario inválido.', 400, 'INVALID_OBFUSCATED_REF');
      }

      const parsed = parseUsuarioPayload(req.body, { passwordRequired: false });
      if (parsed.error) {
        return JsonView.error(res, parsed.error, 400, parsed.code);
      }

      const { nombre, email, password, rol, estado } = parsed.data;
      if (Number(req.session?.usuario_id) === Number(idUsuario) && (rol !== 'admin' || estado !== '1')) {
        return JsonView.error(
          res,
          'No puede quitarse el rol de administrador ni desactivar su propia cuenta activa.',
          400,
          'SELF_MODIFICATION_FORBIDDEN'
        );
      }

      const passwordHash = password.provided ? await hashPassword(password.value) : null;
      const updated = await AdminModel.actualizarUsuario(idUsuario, {
        nombre,
        email,
        passwordHash,
        rol,
        estado
      });

      if (updated?.error === 'EMAIL_EXISTS') {
        return JsonView.error(res, 'Ya existe otro usuario registrado con ese correo electrónico.', 409, 'EMAIL_ALREADY_EXISTS');
      }
      if (!updated) {
        return JsonView.error(res, 'Usuario no encontrado.', 404, 'USER_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_USER_UPDATED', {
        targetUsuarioId: idUsuario,
        email,
        rol,
        estado,
        passwordChanged: Boolean(passwordHash)
      });

      return JsonView.success(res, {
        usuario: formatUsuario(updated),
        mensaje: 'Usuario actualizado correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }

  static async eliminarUsuario(req, res, next) {
    try {
      const idUsuario = decodeRef('usr', req.params.usuarioToken);
      if (!idUsuario) {
        return JsonView.error(res, 'Token de usuario inválido.', 400, 'INVALID_OBFUSCATED_REF');
      }

      if (Number(req.session?.usuario_id) === Number(idUsuario)) {
        return JsonView.error(
          res,
          'No puede eliminar su propia cuenta de administrador activa.',
          400,
          'SELF_DELETE_FORBIDDEN'
        );
      }

      const deleted = await AdminModel.eliminarUsuario(idUsuario);
      if (!deleted) {
        return JsonView.error(res, 'Usuario no encontrado.', 404, 'USER_NOT_FOUND');
      }

      await auditMutation(req, res, 'ADMIN_USER_DELETED', { targetUsuarioId: idUsuario });

      return JsonView.success(res, {
        mensaje: 'Usuario eliminado correctamente.'
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = AdminController;
