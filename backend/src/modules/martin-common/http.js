'use strict';

/**
 * Utilidades HTTP compartidas por los modulos de Martin.
 * Respuestas y errores siguen el formato del CONTRATO_API v1.1:
 *   exito: { data: ... }   error: { error: { code, message, details } }
 */

class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (code, message, details) => new ApiError(400, code, message, details);
const unauthorized = (message = 'Debes iniciar sesión.') => new ApiError(401, 'UNAUTHENTICATED', message);
const forbidden = (code, message, details) => new ApiError(403, code, message, details);
const notFound = (code, message, details) => new ApiError(404, code, message, details);
const conflict = (code, message, details) => new ApiError(409, code, message, details);
const unprocessable = (code, message, details) => new ApiError(422, code, message, details);

/** Permite usar funciones async en Express 4 y 5 sin perder errores. */
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

function sendData(res, data, status = 200, meta) {
  const body = meta ? { data, meta } : { data };
  res.status(status).json(body);
}

/**
 * Manejador de errores a nivel de router: garantiza el formato del contrato
 * aunque el servidor final tenga otro manejador global. No expone detalles
 * internos ni tokens.
 */
function martinErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details || {} },
    });
  }

  // JSON mal formado enviado por el cliente (body-parser).
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'El cuerpo de la petición no es JSON válido.', details: {} },
    });
  }

  // Restricciones de SQLite que se escaparon de las validaciones previas.
  if (err && typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
    console.error('[martin] Restricción de base de datos:', err.message);
    return res.status(409).json({
      error: { code: 'DATA_CONFLICT', message: 'La operación entra en conflicto con datos existentes.', details: {} },
    });
  }

  console.error('[martin] Error no controlado:', err && err.stack ? err.stack : err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado en el servidor.', details: {} },
  });
}

module.exports = {
  ApiError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  asyncHandler,
  sendData,
  martinErrorHandler,
};
