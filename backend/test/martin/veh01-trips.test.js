'use strict';

// VEH-01: Gestión del viaje y ubicación GPS.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, ROUTE1 } = require('./helpers');

test('VEH-01: el conductor ve su asignación con vehículo, línea, recorrido, sentido y horario', async () => {
  const { api, login, auth } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const res = await api.get('/api/v1/driver/shifts').set(auth(token)).expect(200);
  const shift = res.body.data[0];
  assert.equal(shift.vehicle.code, 'VB-001');
  assert.equal(shift.status, 'scheduled');
  assert.ok(shift.plannedStartAt && shift.plannedEndAt);
  const trip = shift.trips[0];
  assert.equal(trip.line.code, 'DEMO-01');
  assert.equal(trip.direction, 'outbound');
  assert.equal(trip.startLabel, 'Terminal Sur');
  assert.ok(trip.plannedStartAt && trip.plannedEndAt);
});

test('VEH-01: sin sesión responde 401 y con rol pasajero responde 403', async () => {
  const { api, login, auth } = await setup();
  assert.equal((await api.get('/api/v1/driver/shifts').expect(401)).body.error.code, 'UNAUTHENTICATED');
  const passenger = await login('pasajero.demo@voybus.local');
  await api.get('/api/v1/driver/shifts').set(auth(passenger)).expect(403);
});

test('VEH-01: no se puede iniciar un viaje sin iniciar antes el turno', async () => {
  const { api, login, auth, myShift } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const shift = await myShift(token);
  const res = await api.post(`/api/v1/driver/shift-trips/${shift.trips[0].shiftTripId}/start`).set(auth(token));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'SHIFT_NOT_ACTIVE');
});

test('VEH-01: iniciar viaje registra hora real y copia los paraderos como instantánea', async () => {
  const { api, db, login, auth, myShift, clock } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const shift = await myShift(token);
  const started = await api.post(`/api/v1/driver/shifts/${shift.id}/start`).set(auth(token)).expect(200);
  assert.equal(started.body.data.status, 'active');
  assert.equal(started.body.data.actualStartAt, clock.now().toISOString());

  const res = await api.post(`/api/v1/driver/shift-trips/${shift.trips[0].shiftTripId}/start`).set(auth(token)).expect(201);
  const { tripId, status, vehicleCode, routeId, startedAt } = res.body.data;
  assert.equal(status, 'active');
  assert.equal(vehicleCode, 'VB-001');
  assert.equal(startedAt, clock.now().toISOString());

  const routeStops = await db.all('SELECT stop_id, sequence FROM route_stops WHERE route_id = ? ORDER BY sequence', [routeId]);
  const tripStops = await db.all('SELECT stop_id, sequence, stop_code_snapshot FROM trip_stops WHERE trip_id = ? ORDER BY sequence', [tripId]);
  assert.equal(tripStops.length, routeStops.length);
  assert.deepEqual(tripStops.map((s) => s.stop_id), routeStops.map((s) => s.stop_id));

  // Cambiar el recorrido después de iniciar no altera el viaje en curso.
  await db.run('DELETE FROM route_stops WHERE route_id = ? AND sequence = 6', [routeId]);
  const after = await db.get('SELECT COUNT(*) AS n FROM trip_stops WHERE trip_id = ?', [tripId]);
  assert.equal(after.n, routeStops.length);
});

test('VEH-01: el conductor no puede mantener dos viajes en curso', async () => {
  const { api, login, auth, startFirstTrip } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const { shift, tripId } = await startFirstTrip(token);
  const res = await api.post(`/api/v1/driver/shift-trips/${shift.trips[1].shiftTripId}/start`).set(auth(token));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'ACTIVE_TRIP_EXISTS');
  assert.equal(res.body.error.details.tripId, tripId);
});

test('VEH-01: otro conductor no puede iniciar un viaje ajeno', async () => {
  const { api, login, auth, myShift } = await setup();
  const owner = await login('conductor1.demo@voybus.local');
  const other = await login('conductor2.demo@voybus.local');
  const shift = await myShift(owner);
  const res = await api.post(`/api/v1/driver/shift-trips/${shift.trips[0].shiftTripId}/start`).set(auth(other));
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'NOT_ASSIGNED_DRIVER');
});

test('VEH-01: un vehículo fuera de servicio no puede iniciar nuevos viajes', async () => {
  const { api, db, login, auth, myShift } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const shift = await myShift(token);
  await api.post(`/api/v1/driver/shifts/${shift.id}/start`).set(auth(token)).expect(200);
  await db.run(`UPDATE vehicles SET status = 'out_of_service' WHERE code = 'VB-001'`);
  const res = await api.post(`/api/v1/driver/shift-trips/${shift.trips[0].shiftTripId}/start`).set(auth(token));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'VEHICLE_UNAVAILABLE');
});

test('VEH-01: validación de lecturas GPS (formato, precisión, antigüedad)', async () => {
  const { api, login, auth, startFirstTrip, clock } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const { tripId } = await startFirstTrip(token);
  const url = `/api/v1/driver/trips/${tripId}/locations`;
  const now = clock.now().toISOString();

  let res = await api.post(url).set(auth(token)).send({ latitude: 200, longitude: -70.4, sampledAt: now });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'INVALID_LOCATION');
  assert.ok(res.body.error.details.latitude);

  res = await api.post(url).set(auth(token)).send({ latitude: -23.69, longitude: -70.41, accuracyMeters: 500, sampledAt: now });
  assert.equal(res.body.error.code, 'LOW_ACCURACY');

  const old = new Date(clock.now().getTime() - 10 * 60 * 1000).toISOString();
  res = await api.post(url).set(auth(token)).send({ latitude: -23.69, longitude: -70.41, accuracyMeters: 5, sampledAt: old });
  assert.equal(res.body.error.code, 'SAMPLE_TOO_OLD');

  res = await api.post(url).set(auth(token)).set('Content-Type', 'application/json').send('{"latitude":');
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_JSON');
});

test('VEH-01: el avance no se decide con una lectura aislada y es monótono', async () => {
  const { db, login, startFirstTrip, sendLocation } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const { tripId } = await startFirstTrip(token);
  const lastPassed = async () => (await db.get('SELECT last_passed_sequence AS n FROM trips WHERE id = ?', [tripId])).n;

  // Una sola lectura más allá del paradero 1 no basta.
  let res = await sendLocation(token, tripId, ...ROUTE1.nearP001a).expect(201);
  assert.equal(res.body.data.lastPassedSequence, 0);
  // La segunda lectura confirma el avance.
  res = await sendLocation(token, tripId, ...ROUTE1.nearP001b).expect(201);
  assert.equal(res.body.data.lastPassedSequence, 1);

  // Una lectura aislada más allá del paradero 3 no salta paraderos.
  res = await sendLocation(token, tripId, ...ROUTE1.pastP003a, { advance: 400 }).expect(201);
  assert.equal(res.body.data.lastPassedSequence, 1);
  res = await sendLocation(token, tripId, ...ROUTE1.pastP003b).expect(201);
  assert.equal(res.body.data.lastPassedSequence, 3);

  // Lecturas fuera de la ruta no cambian el avance.
  await sendLocation(token, tripId, ...ROUTE1.offRoute, { advance: 120 }).expect(201);
  await sendLocation(token, tripId, ...ROUTE1.offRoute).expect(201);
  assert.equal(await lastPassed(), 3);

  // Volver atrás no reduce el avance (monótono).
  await sendLocation(token, tripId, ...ROUTE1.pastP002a, { advance: 120 }).expect(201);
  await sendLocation(token, tripId, ...ROUTE1.pastP002b).expect(201);
  assert.equal(await lastPassed(), 3);
});

test('VEH-01: rechaza saltos imposibles y lecturas desordenadas; reintento idéntico es idempotente', async () => {
  const { api, db, login, auth, startFirstTrip, sendLocation, clock } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const { tripId } = await startFirstTrip(token);
  await sendLocation(token, tripId, ...ROUTE1.nearP001a).expect(201);
  const sampledAt = clock.now().toISOString();

  // Mismo sampledAt (reintento de red): no duplica.
  await api.post(`/api/v1/driver/trips/${tripId}/locations`).set(auth(token))
    .send({ latitude: ROUTE1.nearP001a[0], longitude: ROUTE1.nearP001a[1], accuracyMeters: 8, sampledAt }).expect(201);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM trip_locations WHERE trip_id = ?', [tripId])).n, 1);

  const jump = await sendLocation(token, tripId, ...ROUTE1.pastP004a, { advance: 5 });
  assert.equal(jump.status, 422);
  assert.equal(jump.body.error.code, 'IMPLAUSIBLE_JUMP');

  const older = new Date(Date.parse(sampledAt) - 5000).toISOString();
  const res = await api.post(`/api/v1/driver/trips/${tripId}/locations`).set(auth(token))
    .send({ latitude: -23.699, longitude: -70.4177, accuracyMeters: 8, sampledAt: older });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'OUT_OF_ORDER_SAMPLE');
});

test('VEH-01: pérdida de GPS no finaliza el viaje; finalizar cierra solicitudes y vínculos, pero no el turno', async () => {
  const { api, db, clock, login, auth, startFirstTrip, sendLocation, addStopRequest } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const { shift, tripId } = await startFirstTrip(token);
  await sendLocation(token, tripId, ...ROUTE1.nearP001a).expect(201);
  await addStopRequest(tripId, 4);

  clock.advance(600); // 10 minutos sin señal
  const trip = await db.get('SELECT status FROM trips WHERE id = ?', [tripId]);
  assert.equal(trip.status, 'active');

  const res = await api.post(`/api/v1/driver/trips/${tripId}/finish`).set(auth(token)).expect(200);
  assert.equal(res.body.data.status, 'finished');
  assert.equal(res.body.data.closedRequests, 1);
  assert.equal(res.body.data.endedLinks, 1);

  const request = await db.get('SELECT status, closure_reason, closed_at FROM stop_requests WHERE trip_id = ?', [tripId]);
  assert.equal(request.status, 'closed');
  assert.equal(request.closure_reason, 'trip_finished');
  assert.ok(request.closed_at);
  const link = await db.get('SELECT ended_at FROM trip_links WHERE trip_id = ?', [tripId]);
  assert.ok(link.ended_at);

  const shiftRow = await db.get('SELECT status FROM shifts WHERE id = ?', [shift.id]);
  assert.equal(shiftRow.status, 'active', 'finalizar un viaje no cierra el turno');

  const after = await sendLocation(token, tripId, ...ROUTE1.nearP001b);
  assert.equal(after.status, 409);
  assert.equal(after.body.error.code, 'TRIP_NOT_ACTIVE');

  // Con el viaje terminado ya se puede cerrar el turno.
  const finished = await api.post(`/api/v1/driver/shifts/${shift.id}/finish`).set(auth(token)).expect(200);
  assert.equal(finished.body.data.status, 'completed');
});

test('VEH-01: no se puede cerrar el turno con un viaje en curso', async () => {
  const { api, login, auth, startFirstTrip } = await setup();
  const token = await login('conductor1.demo@voybus.local');
  const { shift } = await startFirstTrip(token);
  const res = await api.post(`/api/v1/driver/shifts/${shift.id}/finish`).set(auth(token));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'ACTIVE_TRIP_IN_SHIFT');
});
