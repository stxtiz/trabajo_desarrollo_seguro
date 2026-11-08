'use strict';

/**
 * Capa Vista MVC (JsonView)
 * Garantiza respuestas JSON canónicas, con Content-Type explícito y sin filtración de detalles internos (OWASP ASVS v5.0 V7.4 & V13)
 */
class JsonView {
  static success(res, data = {}, statusCode = 200) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    return res.status(statusCode).json({
      ok: true,
      requestId: res.locals.requestId || null,
      data
    });
  }

  static error(res, message, statusCode = 400, code = 'BAD_REQUEST') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(statusCode).json({
      ok: false,
      requestId: res.locals.requestId || null,
      error: {
        code,
        message
      }
    });
  }
}

module.exports = JsonView;
