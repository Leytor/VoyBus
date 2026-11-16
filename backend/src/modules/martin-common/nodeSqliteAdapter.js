'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Adaptador entre una conexion `node:sqlite` (DatabaseSync, incluida en
 * Node.js >= 22.13, sin dependencias nativas que compilar) y la interfaz de
 * los modulos de Martin: get / all / run / transaction.
 *
 * Las filas se convierten a objetos planos y las transacciones se serializan
 * con una cola; una transaccion anidada reutiliza la exterior.
 */
function createNodeSqliteAdapter(connection) {
  connection.exec('PRAGMA foreign_keys = ON');
  const insideTransaction = new AsyncLocalStorage();
  let queue = Promise.resolve();

  const params = (values) => (values === undefined ? [] : values);
  const plain = (row) => (row ? { ...row } : row);

  return {
    connection,
    get: (sql, values) => plain(connection.prepare(sql).get(...params(values))),
    all: (sql, values) => connection.prepare(sql).all(...params(values)).map(plain),
    run: (sql, values) => {
      const info = connection.prepare(sql).run(...params(values));
      return { changes: Number(info.changes), lastInsertRowid: Number(info.lastInsertRowid) };
    },
    exec: (sql) => connection.exec(sql),
    close: () => connection.close(),
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
            try {
              connection.exec('ROLLBACK');
            } catch {
              // La transaccion ya se habia cerrado.
            }
            throw error;
          }
        });
      const result = queue.then(run, run);
      queue = result.catch(() => undefined);
      return result;
    },
  };
}

module.exports = { createNodeSqliteAdapter };
