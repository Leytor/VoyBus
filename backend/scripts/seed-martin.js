'use strict';
const { getDb, applySchema, closeDb } = require('../src/lib/db');
const { seed } = require('./seed');
const { hashPassword } = require('../src/services/auth');
const { createNodeSqliteAdapter } = require('../src/modules/martin-common/nodeSqliteAdapter');
const { runMartinSeed } = require('../src/seeds/martinSeed');

async function run() {
  const raw = applySchema(getDb());
  seed(raw); // seguro al reejecutar: no duplica el catálogo
  const result = await runMartinSeed({
    db: createNodeSqliteAdapter(raw),
    hashPassword,
    driverPassword: process.env.DEMO_DRIVER_PASSWORD || 'VoyBus2026!',
  });
  console.log('Seed Martín:', result);
}
if (require.main === module) run().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(closeDb);
module.exports = { run };
