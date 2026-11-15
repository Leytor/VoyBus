'use strict';

// VEH-02: Recepción de alertas de parada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, ROUTE1 } = require('./helpers');

async function alertsOf(ctx, token, tripId) {
  const res = await ctx.api.get(`/api/v1/driver/trips/${tripId}/stop-alerts`).set(ctx.auth(token)).expect(200);
  return res.body.data;
}

test('VEH-02: agrupa solicitudes del mismo paradero con contador, ordenadas según el recorrido', async () => {
  const ctx = await setup();
  const token = await ctx.login('conductor1.demo@voybus.local');
  const { tripId } = await ctx.startFirstTrip(token);
  await ctx.addStopRequest(tripId, 5);
  await ctx.addStopRequest(tripId, 3);
  await ctx.addStopRequest(tripId, 3);

  const data = await alertsOf(ctx, token, tripId);
  assert.deepEqual(data.pending.map((p) => [p.sequence, p.requestCount]), [[3, 2], [5, 1]]);
  assert.equal(data.pending[0].stopName, 'Balneario (demo)');
  assert.equal(data.unseenEvents.length, 2, 'un evento sonoro por paradero, no por solicitud');

  const { n } = await ctx.db.get('SELECT COUNT(*) AS n FROM stop_requests WHERE trip_id = ?', [tripId]);
  assert.equal(n, 3, 'se conservan los registros individuales');
});

test('VEH-02: una nueva solicitud al mismo paradero sube el contador sin una segunda alerta; reconectar no repite', async () => {
  const ctx = await setup();
  const token = await ctx.login('conductor1.demo@voybus.local');
  const { tripId } = await ctx.startFirstTrip(token);
  await ctx.addStopRequest(tripId, 3);

  let data = await alertsOf(ctx, token, tripId);
  assert.equal(data.unseenEvents.length, 1);
  const { eventId } = data.unseenEvents[0];

  // El cliente registra automáticamente la recepción (sin botón de confirmación).
  const seen = await ctx.api.post(`/api/v1/driver/alert-events/${eventId}/seen`).set(ctx.auth(token)).expect(200);
  assert.equal(seen.body.data.eventId, eventId);
  // Registrar dos veces es idempotente.
  await ctx.api.post(`/api/v1/driver/alert-events/${eventId}/seen`).set(ctx.auth(token)).expect(200);

  await ctx.addStopRequest(tripId, 3);
  data = await alertsOf(ctx, token, tripId);
  assert.equal(data.pending[0].requestCount, 2);
  assert.equal(data.unseenEvents.length, 0, 'el contador sube pero no hay nuevo aviso sonoro');

  // "Reconexión": una nueva consulta no devuelve avisos ya recibidos.
  data = await alertsOf(ctx, token, tripId);
  assert.equal(data.unseenEvents.length, 0);
});

test('VEH-02: el paradero superado desaparece y sus solicitudes se cierran (stop_passed); la siguiente pasa a next', async () => {
  const ctx = await setup();
  const token = await ctx.login('conductor1.demo@voybus.local');
  const { tripId } = await ctx.startFirstTrip(token);
  const r2 = await ctx.addStopRequest(tripId, 2);
  const r3 = await ctx.addStopRequest(tripId, 3);

  let data = await alertsOf(ctx, token, tripId);
  const status = async (id) => ctx.db.get('SELECT status, closure_reason FROM stop_requests WHERE id = ?', [id]);
  // Al iniciar, el siguiente paradero es el 1 (origen): ambas siguen en `sent`.
  assert.equal((await status(r2)).status, 'sent');
  assert.equal((await status(r3)).status, 'sent');

  await ctx.sendLocation(token, tripId, ...ROUTE1.nearP001a).expect(201);
  await ctx.sendLocation(token, tripId, ...ROUTE1.nearP001b).expect(201);
  assert.equal((await status(r2)).status, 'next', 'superado el paradero 1, el destino 2 es el siguiente');
  assert.equal((await status(r3)).status, 'sent');

  await ctx.sendLocation(token, tripId, ...ROUTE1.pastP002a, { advance: 300 }).expect(201);
  const res = await ctx.sendLocation(token, tripId, ...ROUTE1.pastP002b).expect(201);
  assert.equal(res.body.data.lastPassedSequence, 2);

  assert.deepEqual(await status(r2), { status: 'closed', closure_reason: 'stop_passed' });
  assert.equal((await status(r3)).status, 'next');

  data = await alertsOf(ctx, token, tripId);
  assert.deepEqual(data.pending.map((p) => p.sequence), [3], 'el paradero superado ya no aparece');
});

test('VEH-02: avisos de un viaje solo para su conductor; viaje finalizado no entrega alertas', async () => {
  const ctx = await setup();
  const token = await ctx.login('conductor1.demo@voybus.local');
  const other = await ctx.login('conductor2.demo@voybus.local');
  const { tripId } = await ctx.startFirstTrip(token);
  await ctx.addStopRequest(tripId, 3);
  const data = await alertsOf(ctx, token, tripId);

  await ctx.api.get(`/api/v1/driver/trips/${tripId}/stop-alerts`).set(ctx.auth(other)).expect(403);
  await ctx.api.post(`/api/v1/driver/alert-events/${data.unseenEvents[0].eventId}/seen`).set(ctx.auth(other)).expect(403);
  await ctx.api.post('/api/v1/driver/alert-events/99999/seen').set(ctx.auth(token)).expect(404);

  await ctx.api.post(`/api/v1/driver/trips/${tripId}/finish`).set(ctx.auth(token)).expect(200);
  const res = await ctx.api.get(`/api/v1/driver/trips/${tripId}/stop-alerts`).set(ctx.auth(token));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'TRIP_NOT_ACTIVE');
});
