'use strict';

const { resolveConfig } = require('./config');

/**
 * Dependencias que el servidor final (Gianny) entrega a los modulos de Martin.
 *
 * db   -> adaptador con 4 metodos (pueden ser sincronos o devolver Promise):
 *           get(sql, params)  -> fila u undefined
 *           all(sql, params)  -> arreglo de filas
 *           run(sql, params)  -> { changes, lastInsertRowid }
 *           transaction(fn)   -> ejecuta fn() de forma atomica y devuelve su resultado
 * auth -> integracion con la autenticacion compartida de Gianny:
 *           requireRole(...roles) -> middleware Express (401/403 segun contrato)
 *           getActor(req)         -> { userId, role } de la sesion actual
 * clock  -> opcional, { now: () => Date } (se reemplaza en las pruebas)
 * config -> opcional, sobrescribe parametros de config.js
 */
function normalizeDeps(deps) {
  if (!deps || !deps.db) throw new Error('[martin] Falta la dependencia "db".');
  const { db } = deps;
  for (const method of ['get', 'all', 'run', 'transaction']) {
    if (typeof db[method] !== 'function') {
      throw new Error(`[martin] El adaptador "db" debe implementar ${method}().`);
    }
  }
  if (!deps.auth || typeof deps.auth.requireRole !== 'function' || typeof deps.auth.getActor !== 'function') {
    throw new Error('[martin] La dependencia "auth" debe implementar requireRole() y getActor().');
  }
  return {
    db,
    auth: deps.auth,
    clock: deps.clock || { now: () => new Date() },
    config: resolveConfig(deps.config),
  };
}

module.exports = { normalizeDeps };
