'use strict';

/**
 * Base SQLite en memoria para las pruebas de los modulos de Martin.
 * Usa node:sqlite (Node.js >= 22.13) y una copia exacta de database/schema.sql
 * del contrato v1.1 (contract-and-seed.test.js verifica su hash).
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createNodeSqliteAdapter } = require('../../../src/modules/martin-common/nodeSqliteAdapter');

const SCHEMA_PATH = path.join(__dirname, 'schema.contrato-v1.1.sql');

function openTestDatabase() {
  const connection = new DatabaseSync(':memory:');
  connection.exec('PRAGMA foreign_keys = ON');
  connection.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return createNodeSqliteAdapter(connection);
}

module.exports = { openTestDatabase, SCHEMA_PATH };
