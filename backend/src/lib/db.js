const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

let instance;
function getDb() {
  if (!instance) {
    const destination = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'voybus.sqlite');
    const filepath = path.resolve(destination);
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    instance = new DatabaseSync(filepath);
    instance.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  }
  return instance;
}
function applySchema(db = getDb()) {
  db.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8'));
  return db;
}
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) { /* Se conserva el error original. */ }
    throw error;
  }
}
function closeDb() {
  if (instance) instance.close();
  instance = undefined;
}
module.exports = { getDb, applySchema, transaction, closeDb };
