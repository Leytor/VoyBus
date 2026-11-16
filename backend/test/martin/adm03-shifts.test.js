'use strict';

// ADM-03: Gestión de turnos y asignaciones.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('./helpers');

async function context() {
  const ctx = await setup();
  const admin = await ctx.login('admin.demo@voybus.local');
  const id = async (sql, params) => (await ctx.db.get(sql, params)).id;
  const ids = {
    driver2: await id('SELECT id FROM users WHERE email = ?', ['conductor2.demo@voybus.local']),
    driver3: await id('SELECT id FROM users WHERE email = ?', ['conductor3.demo@voybus.local']),
    driver5: await id('SELECT id FROM users WHERE email = ?', ['conductor5.demo@voybus.local']),
    vb005: await id(`SELECT id FROM vehicles WHERE code = 'VB-005'`),
    vb006: await id(`SELECT id FROM vehicles WHERE code = 'VB-006'`),
    vb009: await id(`SELECT id FROM vehicles WHERE code = 'VB-009'`),
    vb011: await id(`SELECT id FROM vehicles WHERE code = 'VB-011'`),
    vb012: await id(`SELECT id FROM vehicles WHERE code = 'VB-012'`),
    route: await id(`SELECT r.id FROM routes r JOIN lines l ON l.id = r.line_id WHERE l.code = 'DEMO-02' AND r.direction = 'outbound'`),
  };
  const create = (body) => ctx.api.post('/api/v1/admin/shifts').set(ctx.auth(admin)).send(body);
  const patch = (shiftId, body) => ctx.api.patch(`/api/v1/admin/shifts/${shiftId}`).set(ctx.auth(admin)).send(body);
  const shiftBody = (overrides = {}) => ({
    driverUserId: ids.driver2,
    vehicleId: ids.vb005,
    plannedStartAt: '2026-11-17T12:00:00.000Z',
    plannedEndAt: '2026-11-17T20:00:00.000Z',
    toleranceMinutes: 10,
    plannedTrips: [
      { routeId: ids.route, sequence: 1, plannedStartAt: '2026-11-17T12:30:00.000Z', plannedEndAt: '2026-11-17T14:00:00.000Z' },
      { routeId: ids.route, sequence: 2, plannedStartAt: '2026-11-17T14:30:00.000Z', plannedEndAt: '2026-11-17T16:00:00.000Z' },
    ],
    ...overrides,
  });
  return { ...ctx, admin, ids, create, patch, shiftBody };
}

test('ADM-03: solo el administrador gestiona turnos (401 sin sesión, 403 con otro rol)', async () => {
  const ctx = await context();
  await ctx.api.get('/api/v1/admin/shifts').expect(401);
  const driver = await ctx.login('conductor1.demo@voybus.local');
  await ctx.api.post('/api/v1/admin/shifts').set(ctx.auth(driver)).send(ctx.shiftBody()).expect(403);
});

test('ADM-03: lista conductores y vehículos con su disponibilidad', async () => {
  const ctx = await context();
  const drivers = (await ctx.api.get('/api/v1/admin/drivers').set(ctx.auth(ctx.admin)).expect(200)).body.data;
  assert.equal(drivers.find((d) => d.id === ctx.ids.driver5).enabled, false);
  const vehicles = (await ctx.api.get('/api/v1/admin/vehicles').set(ctx.auth(ctx.admin)).expect(200)).body.data;
  assert.ok(vehicles.length >= 10);
  assert.equal(vehicles.find((v) => v.code === 'VB-011').assignable, false);
  assert.equal(vehicles.find((v) => v.code === 'VB-009').assignable, true);
});

test('ADM-03: crea un turno con viajes en orden y aparece en la vista del conductor', async () => {
  const ctx = await context();
  const res = await ctx.create(ctx.shiftBody()).expect(201);
  const shift = res.body.data;
  assert.equal(shift.status, 'scheduled');
  assert.equal(shift.toleranceMinutes, 10);
  assert.deepEqual(shift.trips.map((t) => t.sequence), [1, 2]);
  assert.equal(shift.trips[0].line.code, 'DEMO-02');

  const driver = await ctx.login('conductor2.demo@voybus.local');
  const mine = (await ctx.api.get('/api/v1/driver/shifts').set(ctx.auth(driver)).expect(200)).body.data;
  assert.ok(mine.some((s) => s.id === shift.id), 'la asignación aparece en la vista del conductor');
});

test('ADM-03: rechaza turnos superpuestos por conductor o por vehículo; los contiguos son válidos', async () => {
  const ctx = await context();
  await ctx.create(ctx.shiftBody()).expect(201);

  let res = await ctx.create(ctx.shiftBody({
    vehicleId: ctx.ids.vb006,
    plannedStartAt: '2026-11-17T19:00:00.000Z',
    plannedEndAt: '2026-11-17T23:00:00.000Z',
    plannedTrips: [{ routeId: ctx.ids.route, sequence: 1, plannedStartAt: '2026-11-17T19:30:00.000Z', plannedEndAt: '2026-11-17T21:00:00.000Z' }],
  }));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'SHIFT_OVERLAP');
  assert.equal(res.body.error.details.resource, 'driver');

  res = await ctx.create(ctx.shiftBody({ driverUserId: ctx.ids.driver3 }));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.details.resource, 'vehicle');

  // [inicio, fin): empieza justo cuando termina el otro.
  res = await ctx.create(ctx.shiftBody({
    plannedStartAt: '2026-11-17T20:00:00.000Z',
    plannedEndAt: '2026-11-17T23:00:00.000Z',
    plannedTrips: [{ routeId: ctx.ids.route, sequence: 1, plannedStartAt: '2026-11-17T20:10:00.000Z', plannedEndAt: '2026-11-17T21:30:00.000Z' }],
  }));
  assert.equal(res.status, 201);
});

test('ADM-03: solo conductores habilitados y vehículos operativos (con o sin observaciones)', async () => {
  const ctx = await context();
  let res = await ctx.create(ctx.shiftBody({ driverUserId: ctx.ids.driver5 }));
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'DRIVER_UNAVAILABLE');

  res = await ctx.create(ctx.shiftBody({ vehicleId: ctx.ids.vb011 }));
  assert.equal(res.body.error.code, 'VEHICLE_UNAVAILABLE');
  assert.equal(res.body.error.details.reason, 'maintenance');

  res = await ctx.create(ctx.shiftBody({ vehicleId: ctx.ids.vb012 }));
  assert.equal(res.body.error.code, 'VEHICLE_UNAVAILABLE');
  assert.equal(res.body.error.details.reason, 'out_of_service');

  res = await ctx.create(ctx.shiftBody({ vehicleId: ctx.ids.vb009 }));
  assert.equal(res.status, 201, 'operativo con observaciones sí se puede asignar');
});

test('ADM-03: valida horario de viajes (dentro del turno, orden único, sin superponerse) y formato', async () => {
  const ctx = await context();
  const trip = (sequence, start, end) => ({ routeId: ctx.ids.route, sequence, plannedStartAt: start, plannedEndAt: end });

  let res = await ctx.create(ctx.shiftBody({ plannedTrips: [trip(1, '2026-11-17T11:00:00.000Z', '2026-11-17T13:00:00.000Z')] }));
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'INVALID_TRIP_SCHEDULE');
  assert.equal(res.body.error.details.reason, 'trip_outside_shift');

  res = await ctx.create(ctx.shiftBody({
    plannedTrips: [trip(1, '2026-11-17T12:30:00.000Z', '2026-11-17T13:00:00.000Z'), trip(1, '2026-11-17T14:00:00.000Z', '2026-11-17T15:00:00.000Z')],
  }));
  assert.equal(res.body.error.details.reason, 'duplicated_sequence');

  res = await ctx.create(ctx.shiftBody({
    plannedTrips: [trip(1, '2026-11-17T12:30:00.000Z', '2026-11-17T14:00:00.000Z'), trip(2, '2026-11-17T13:30:00.000Z', '2026-11-17T15:00:00.000Z')],
  }));
  assert.equal(res.body.error.details.reason, 'trips_overlap_or_out_of_order');

  res = await ctx.create(ctx.shiftBody({ plannedEndAt: '2026-11-17T11:00:00.000Z' }));
  assert.equal(res.body.error.details.reason, 'shift_end_before_start');

  res = await ctx.create({ driverUserId: 'x', plannedTrips: [] });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(res.body.error.details.driverUserId && res.body.error.details.plannedStartAt);
});

test('ADM-03: modifica tolerancia y horario, valida conflictos al editar y permite cancelar', async () => {
  const ctx = await context();
  const shift = (await ctx.create(ctx.shiftBody()).expect(201)).body.data;
  const other = (await ctx.create(ctx.shiftBody({
    driverUserId: ctx.ids.driver3, vehicleId: ctx.ids.vb006,
  })).expect(201)).body.data;

  let res = await ctx.patch(shift.id, { toleranceMinutes: 15 }).expect(200);
  assert.equal(res.body.data.toleranceMinutes, 15);

  res = await ctx.patch(other.id, { vehicleId: ctx.ids.vb005 });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'SHIFT_OVERLAP');

  res = await ctx.patch(shift.id, {
    plannedTrips: [{ routeId: ctx.ids.route, sequence: 1, plannedStartAt: '2026-11-17T13:00:00.000Z', plannedEndAt: '2026-11-17T15:00:00.000Z' }],
  }).expect(200);
  assert.equal(res.body.data.trips.length, 1);

  res = await ctx.patch(shift.id, { status: 'cancelled' }).expect(200);
  assert.equal(res.body.data.status, 'cancelled');
  res = await ctx.patch(shift.id, { toleranceMinutes: 5 });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'SHIFT_NOT_EDITABLE');
});

test('ADM-03: con el turno en curso no se cambian conductor, vehículo ni viajes', async () => {
  const ctx = await context();
  const driver = await ctx.login('conductor1.demo@voybus.local');
  const { shift } = await ctx.startFirstTrip(driver);
  const res = await ctx.patch(shift.id, { vehicleId: ctx.ids.vb006 });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'SHIFT_IN_PROGRESS');
  await ctx.patch(shift.id, { toleranceMinutes: 20 }).expect(200);
});

test('ADM-03: la tolerancia definida identifica atrasos de inicio', async () => {
  const ctx = await context();
  const driver = await ctx.login('conductor3.demo@voybus.local');
  const shift = await ctx.myShift(driver);
  assert.equal(shift.toleranceMinutes, 15);

  ctx.clock.set(new Date(Date.parse(shift.plannedStartAt) + 25 * 60 * 1000).toISOString());
  const listed = (await ctx.api.get('/api/v1/admin/shifts').set(ctx.auth(ctx.admin)).expect(200)).body.data;
  assert.equal(listed.find((s) => s.id === shift.id).punctuality.status, 'not_started_late');

  const started = await ctx.api.post(`/api/v1/driver/shifts/${shift.id}/start`).set(ctx.auth(driver)).expect(200);
  assert.equal(started.body.data.punctuality.status, 'late');
  assert.equal(started.body.data.punctuality.delayMinutes, 25);
  assert.equal(started.body.data.plannedStartAt, shift.plannedStartAt, 'se conservan las horas originales');
});
