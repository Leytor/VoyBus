'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { SCHEMA_PATH, openTestDatabase } = require('./support/testDb');
const { runDemoCatalogSeed } = require('./support/catalogFixture');
const { runMartinSeed } = require('../../src/seeds/martinSeed');
const { evaluateProgress } = require('../../src/modules/driver/tripProgress');
const { DEFAULT_CONFIG } = require('../../src/modules/martin-common/config');

// Hash SHA-256 de database/schema.sql del contrato compartido v1.1 (sin modificar).
const CONTRACT_SCHEMA_SHA256 = 'ef8a1fe7ca4aae53fbe0e61835e8dce8fe182ebe8db53c1c8ac33a9ca0eeb365';

test('Contrato: las pruebas usan una copia idéntica de schema.sql v1.1', () => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(SCHEMA_PATH)).digest('hex');
  assert.equal(hash, CONTRACT_SCHEMA_SHA256);
});

test('Seed de Martin: es idempotente y no borra datos del catálogo', async () => {
  const db = openTestDatabase();
  await runDemoCatalogSeed(db);
  const before = await db.get('SELECT COUNT(*) AS n FROM lines');
  const first = await runMartinSeed({ db });
  const second = await runMartinSeed({ db });
  assert.ok(first.vehiclesTotal >= 10);
  assert.equal(second.vehiclesCreated, 0);
  assert.equal(second.driversCreated, 0);
  assert.equal(second.shiftsCreated, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM lines')).n, before.n);
});

test('Seed de Martin: falla con un mensaje claro si falta el catálogo de Gianny', async () => {
  const db = openTestDatabase();
  await assert.rejects(runMartinSeed({ db }), /seed de catálogo de Gianny/);
});

test('Avance: sin geometría usa los paraderos; con GPS lejano de la ruta no avanza', () => {
  const tripStops = [
    { sequence: 1, latitude: -23.7, longitude: -70.418 },
    { sequence: 2, latitude: -23.68, longitude: -70.412 },
  ];
  const gps = DEFAULT_CONFIG.gps;
  const near = evaluateProgress({
    geometryJson: '[]', tripStops, lastPassedSequence: 0, gps,
    recentSamples: [
      { latitude: -23.698, longitude: -70.4174, sampledAt: '2026-11-16T12:00:10.000Z' },
      { latitude: -23.699, longitude: -70.4177, sampledAt: '2026-11-16T12:00:00.000Z' },
    ],
  });
  assert.equal(near.lastPassedSequence, 1);

  const far = evaluateProgress({
    geometryJson: '[]', tripStops, lastPassedSequence: 0, gps,
    recentSamples: [
      { latitude: -23.698, longitude: -70.39, sampledAt: '2026-11-16T12:00:10.000Z' },
      { latitude: -23.699, longitude: -70.39, sampledAt: '2026-11-16T12:00:00.000Z' },
    ],
  });
  assert.equal(far.lastPassedSequence, 0);
  assert.equal(far.reason, 'off_route');
});
