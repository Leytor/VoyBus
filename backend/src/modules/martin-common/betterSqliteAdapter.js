'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Adaptador entre una conexion `better-sqlite3` y la interfaz que usan los
 * modulos de Martin: get / all / run / transaction.
 *
 * Si el servidor final usa otra libreria (sqlite3, Sequelize, node:sqlite),
 * basta con escribir un adaptador equivalente de estos 4 metodos
 * (ver docs/martin/INTEGRACION.md).
 *
 * transaction(fn): BEGIN IMMEDIATE ... COMMIT/ROLLBACK. Las transacciones se
 * serializan con una cola para que dos peticiones no mezclen sus sentencias;
 * una transaccion anidada (misma cadena async) reutiliza la exterior.
 */
function createBetterSqliteAdapter(connection) {
  connection.pragma('foreign_keys = ON');
  const insideTransaction = new AsyncLocalStorage();
  let queue = Promise.resolve();

  const normalizeParams = (params) => (params === undefined ? [] : params);

  return {
    connection,
    get: (sql, params) => connection.prepare(sql).get(normalizeParams(params)),
    all: (sql, params) => connection.prepare(sql).all(normalizeParams(params)),
    run: (sql, params) => {
      const info = connection.prepare(sql).run(normalizeParams(params));
      return { changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) };
    },
    exec: (sql) => connection.exec(sql),
    transaction(fn) {
      if (insideTransaction.getStore()) return Promise.resolve().then(fn);
      const run = () =>
        insideTransaction.run(true, async () => {
          connection.exec('BEGIN IMMEDIATE');
          try {
            const result = await fn();
            connection.exec('COMMIT');
            return result;
          } catch (error) {
            if (connection.inTransaction) connection.exec('ROLLBACK');
            throw error;
          }
        });
      const result = queue.then(run, run);
      queue = result.catch(() => undefined);
      return result;
    },
  };
}

module.exports = { createBetterSqliteAdapter };
