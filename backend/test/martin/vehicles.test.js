'use strict';

// RED-02 (duplicado en la ERS): Visualizacion de vehiculos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, ROUTE1 } = require('./helpers');

test('Vehículos: el seed tiene al menos 10 vehículos', async () => {
  const { db } = await setup();
  const { n } = await db.get('SELECT COUNT(*) AS n FROM vehicles');
  assert.ok(n >= 10, `se esperaban >= 10 vehículos y hay ${n}`);
});

test('Vehículos: consulta pública sin sesión y sin viajes activos devuelve lista vacía', async () => {
  const { api } = await setup();
  const res = await api.get('/api/v1/vehicles/active').expect(200);
  assert.deepEqual(res.body, { data: [] });
});

test('Vehículos: muestra solo viajes activos con ubicación, filtra por línea y oculta finalizados', async () => {
  const { api, login, auth, startFirstTrip, sendLocation, db } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const { tripId } = await startFirstTrip(token);

  // Viaje activo sin lectura GPS todavia: no se muestra (no hay posición).
  let res = await api.get('/api/v1/vehicles/active').expect(200);
  assert.equal(res.body.data.length, 0);

  await sendLocation(token, tripId, ...ROUTE1.nearP001a).expect(201);
  res = await api.get('/api/v1/vehicles/active').expect(200);
  assert.equal(res.body.data.length, 1);
  const vehicle = res.body.data[0];
  assert.deepEqual(Object.keys(vehicle).sort(), [
    'direction', 'latitude', 'lineId', 'locationStale', 'locationUpdatedAt', 'longitude', 'routeId', 'tripId',
    'vehicleCode',
  ]);
  assert.equal(vehicle.vehicleCode, 'VB-001');
  assert.equal(vehicle.tripId, tripId);
  assert.equal(vehicle.direction, 'outbound');
  assert.equal(vehicle.latitude, ROUTE1.nearP001a[0]);
  assert.equal(vehicle.locationStale, false);
  assert.match(vehicle.locationUpdatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  const { id: line1 } = await db.get(`SELECT id FROM lines WHERE code = 'DEMO-01'`);
  const { id: line2 } = await db.get(`SELECT id FROM lines WHERE code = 'DEMO-02'`);
  assert.equal((await api.get(`/api/v1/vehicles/active?lineId=${line1}`)).body.data.length, 1);
  assert.equal((await api.get(`/api/v1/vehicles/active?lineId=${line2}`)).body.data.length, 0);

  await api.post(`/api/v1/driver/trips/${tripId}/finish`).set(auth(token)).expect(200);
  res = await api.get('/api/v1/vehicles/active').expect(200);
  assert.equal(res.body.data.length, 0, 'el vehículo con viaje finalizado deja de mostrarse');
});

test('Vehículos: la posición se actualiza con nuevas lecturas (sin recargar datos fijos)', async () => {
  const { api, login, startFirstTrip, sendLocation } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const { tripId } = await startFirstTrip(token);
  await sendLocation(token, tripId, ...ROUTE1.nearP001a).expect(201);
  const first = (await api.get('/api/v1/vehicles/active')).body.data[0];
  await sendLocation(token, tripId, ...ROUTE1.nearP001b).expect(201);
  const second = (await api.get('/api/v1/vehicles/active')).body.data[0];
  assert.equal(second.latitude, ROUTE1.nearP001b[0]);
  assert.ok(Date.parse(second.locationUpdatedAt) > Date.parse(first.locationUpdatedAt));
});

test('Vehículos: sin señal GPS por más de 30 s se conserva la última posición marcada como atrasada', async () => {
  const { api, clock, login, startFirstTrip, sendLocation } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const { tripId } = await startFirstTrip(token);
  await sendLocation(token, tripId, ...ROUTE1.nearP001a).expect(201);

  clock.advance(29);
  assert.equal((await api.get('/api/v1/vehicles/active')).body.data[0].locationStale, false);
  clock.advance(2);
  const stale = (await api.get('/api/v1/vehicles/active')).body.data[0];
  assert.equal(stale.locationStale, true);
  assert.equal(stale.latitude, ROUTE1.nearP001a[0], 'conserva la última posición conocida');
});

test('Vehículos: lineId con formato inválido responde 400 con el formato de error del contrato', async () => {
  const { api } = await setup();
  const res = await api.get('/api/v1/vehicles/active?lineId=abc').expect(400);
  assert.equal(res.body.error.code, 'INVALID_ID');
  assert.ok(res.body.error.message);
  assert.deepEqual(res.body.error.details, { field: 'lineId' });
});
