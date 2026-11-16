'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { seed } = require('../scripts/seed');
const auth = require('../src/services/auth');
const travel = require('../src/services/travel');
const { createNodeSqliteAdapter } = require('../src/modules/martin-common/nodeSqliteAdapter');
const { runMartinSeed } = require('../src/seeds/martinSeed');
const { createDriverService } = require('../src/modules/driver/driver.service');
const { createStopAlertsService } = require('../src/modules/driver/stopAlerts.service');
const { resolveConfig } = require('../src/modules/martin-common/config');

test('Integración Gianny/Martín: turno -> viaje -> parada -> alerta -> cierre', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(fs.readFileSync(path.join(__dirname,'../database/schema.sql'), 'utf8'));
    seed(db);
    const adapter = createNodeSqliteAdapter(db);
    await runMartinSeed({db: adapter, hashPassword: auth.hashPassword, driverPassword: 'VoyBus2026!'});
    const login = auth.login(db, 'conductor1.demo@voybus.local', 'VoyBus2026!');
    const actor = auth.resolveToken(db, login.token);
    const driverActor = {userId: actor.id, role: 'driver'};
    const deps = {db: adapter, clock: {now: () => new Date()}, config: resolveConfig()};
    const driver = createDriverService(deps);
    const alerts = createStopAlertsService(deps, driver);
    const shifts = await driver.listMyShifts(driverActor);
    assert.ok(shifts.length > 0);
    await driver.startShift(driverActor, shifts[0].id);
    const activeShift = (await driver.listMyShifts(driverActor)).find(s=>s.id===shifts[0].id);
    const trip = await driver.startTrip(driverActor, activeShift.trips[0].shiftTripId);
    const guest = auth.resolveToken(db, auth.guest(db).token);
    assert.equal(travel.resolveVehicle(db, trip.vehicleCode).trip.id, trip.tripId);
    travel.link(db, guest, trip.vehicleCode);
    const future = travel.futureStops(db, guest).stops;
    assert.ok(future.length >= 3);
    const stop = future[2];
    const request = travel.submitRequest(db, guest, {tripStopId: stop.tripStopId, idempotencyKey: crypto.randomUUID()});
    assert.equal(request.status,'sent');
    assert.ok((await alerts.getStopAlerts(driverActor,trip.tripId)).pending.length>0);
    await driver.finishTrip(driverActor,trip.tripId);
    assert.equal(travel.latestRequest(db,guest).status,'closed');
    assert.equal(travel.currentLink(db,guest),null);
  } finally {db.close();}
});
