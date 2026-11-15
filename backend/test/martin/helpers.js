'use strict';

/**
 * Entorno de prueba: SQLite en memoria con el esquema del contrato, catalogo
 * demo, seed de Martin y un reloj controlable para probar tiempos (GPS atrasado,
 * tolerancia de turnos).
 */
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
const { createMartinRouter } = require('../../src/modules/martin.routes');
const { martinErrorHandler } = require('../../src/modules/martin-common/http');
const { runMartinSeed } = require('../../src/seeds/martinSeed');
const { openTestDatabase } = require('./support/testDb');
const { createDevAuth, hashPassword } = require('./support/testAuth');
const { runDemoCatalogSeed } = require('./support/catalogFixture');
const { seedDemoUsers } = require('./support/users');

const PASSWORD = 'Test.Password1';
const START = '2026-11-16T12:02:00.000Z';

function createClock(iso) {
  let current = Date.parse(iso);
  return {
    now: () => new Date(current),
    set: (value) => { current = Date.parse(value); },
    advance: (seconds) => { current += seconds * 1000; },
  };
}

/** App Express minima: auth de prueba + routers de Martin montados como en el servidor final. */
function createTestApp({ db, clock }) {
  const app = express();
  app.use(express.json());
  const auth = createDevAuth({ db, clock });
  const api = express.Router();
  api.use(auth.router);
  api.use(createMartinRouter({ db, clock, auth }));
  app.use('/api/v1', api);
  app.use(martinErrorHandler);
  return app;
}

async function setup() {
  const clock = createClock(START);
  const db = openTestDatabase();
  await runDemoCatalogSeed(db);
  await seedDemoUsers(db, PASSWORD);
  await runMartinSeed({ db, hashPassword, driverPassword: PASSWORD, clock });
  const api = request(createTestApp({ db, clock }));

  async function login(email) {
    const res = await api.post('/api/v1/auth/login').send({ email, password: PASSWORD });
    if (res.status !== 200) throw new Error(`login ${email} -> ${res.status}`);
    return res.body.data.token;
  }

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  async function myShift(token) {
    const res = await api.get('/api/v1/driver/shifts').set(auth(token));
    return res.body.data[0];
  }

  /** Inicia turno y primer viaje del conductor; devuelve { shift, tripId }. */
  async function startFirstTrip(token) {
    const shift = await myShift(token);
    await api.post(`/api/v1/driver/shifts/${shift.id}/start`).set(auth(token)).expect(200);
    const res = await api
      .post(`/api/v1/driver/shift-trips/${shift.trips[0].shiftTripId}/start`)
      .set(auth(token))
      .expect(201);
    return { shift, tripId: res.body.data.tripId };
  }

  /** Envia una lectura GPS con la hora actual del reloj (tras avanzar `advance` segundos). */
  function sendLocation(token, tripId, latitude, longitude, { advance = 10, accuracyMeters = 8 } = {}) {
    clock.advance(advance);
    return api
      .post(`/api/v1/driver/trips/${tripId}/locations`)
      .set(auth(token))
      .send({ latitude, longitude, accuracyMeters, sampledAt: clock.now().toISOString() });
  }

  /**
   * FIXTURE: crea una solicitud de parada como la crearia el modulo de Gianny
   * (VIA-01/VIA-02): sesion invitado + vinculo + solicitud. Solo para pruebas.
   */
  async function addStopRequest(tripId, sequence) {
    const guest = await db.run('INSERT INTO guest_sessions (token_hash, expires_at) VALUES (?, ?)', [
      crypto.randomBytes(16).toString('hex'),
      '2099-01-01T00:00:00.000Z',
    ]);
    const link = await db.run('INSERT INTO trip_links (trip_id, guest_session_id) VALUES (?, ?)', [
      tripId,
      guest.lastInsertRowid,
    ]);
    const stop = await db.get('SELECT id FROM trip_stops WHERE trip_id = ? AND sequence = ?', [tripId, sequence]);
    const req = await db.run(
      `INSERT INTO stop_requests (trip_id, trip_link_id, trip_stop_id, status, idempotency_key)
       VALUES (?, ?, ?, 'sent', ?)`,
      [tripId, link.lastInsertRowid, stop.id, crypto.randomUUID()],
    );
    return req.lastInsertRowid;
  }

  return { db, clock, api, login, auth, myShift, startFirstTrip, sendLocation, addStopRequest };
}

/** Puntos sobre la Linea Demo 1 (ida, P001 -> P006) del catalogo demo. */
const ROUTE1 = {
  nearP001a: [-23.699, -70.4177],
  nearP001b: [-23.698, -70.4174],
  pastP002a: [-23.6785, -70.41155],
  pastP002b: [-23.678, -70.4114],
  pastP003a: [-23.6585, -70.40555],
  pastP003b: [-23.658, -70.4054],
  pastP004a: [-23.6435, -70.4007],
  pastP004b: [-23.643, -70.4006],
  offRoute: [-23.66, -70.39],
};

module.exports = { setup, ROUTE1, START };
