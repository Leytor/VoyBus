'use strict';

/** SOLO PRUEBAS: administrador y pasajero de prueba (en la app los crea el seed de Gianny). */
const { hashPassword } = require('./testAuth');

const DEMO_PASSWORD = 'Test.Password1';

async function seedDemoUsers(db, password = DEMO_PASSWORD) {
  const users = [
    ['Administrador Demo', 'admin.demo@voybus.local', 'admin'],
    ['Pasajero Demo', 'pasajero.demo@voybus.local', 'passenger'],
  ];
  for (const [fullName, email, role] of users) {
    await db.run(
      `INSERT INTO users (full_name, email, password_hash, role, enabled, verified_at)
       VALUES (?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ON CONFLICT(email) DO NOTHING`,
      [fullName, email, hashPassword(password), role],
    );
  }
}

module.exports = { seedDemoUsers, DEMO_PASSWORD };
