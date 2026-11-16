const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const auth=require('../src/services/auth');
const catalog=require('../src/services/transport');
const travel=require('../src/services/travel');
const {seed}=require('../scripts/seed');
const {demoTrip}=require('../scripts/demo-trip');
const {DEMO_STOPS,DEMO_ROUTE_IDS}=require('../scripts/demo-geography');
const {applyDemoGeography}=require('../scripts/update-demo-map');

function setup() {
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));
  seed(db);
  return db;
}
function passenger(db) {
  const login=auth.login(db,'pasajero@voybus.local','VoyBus2026!');
  return auth.resolveToken(db,login.token);
}
function visitor(db) {
  const info=auth.guest(db);
  return auth.resolveToken(db,info.token);
}
const uid='7a0e6c23-3f8e-48c2-b751-f0c640d90001';

test('ERS RED-01: catálogo, búsqueda y suspensión/deshabilitación',()=>{
  const db=setup();
  const result=catalog.lines(db,{});
  assert.equal(result.meta.total,4);
  assert.equal(result.data.filter(x=>x.status==='active').length,3);
  assert.equal(result.data.filter(x=>x.status==='suspended').length,1);
  assert.equal(catalog.lines(db,{search:'DEMO-05'}).data.length,0);
  assert.equal(catalog.lines(db,{search:'Norte'}).data[0].code,'DEMO-01');
  assert.equal(catalog.lineRoutes(db,1).length,2);
  const route=catalog.route(db,10);
  assert.deepEqual(route.stops.map(s=>s.sequence),[1,2,3,4,5,6]);
  assert.ok(route.geometry.length>=2);
  db.close();
});
test('ERS RED-02: paraderos 12, buscador, recorridos y favoritos persistentes',()=>{
  const db=setup();
  const actor=passenger(db);
  assert.equal(catalog.stops(db,{pageSize:50}).meta.total,12);
  assert.equal(catalog.stops(db,{search:'P001'}).data.length,1);
  assert.ok(catalog.stop(db,1).routes.length>0);
  assert.equal(catalog.favorites(db,actor.id).length,0);
  catalog.addFavorite(db,actor.id,1);
  catalog.addFavorite(db,actor.id,1);
  assert.equal(catalog.favorites(db,actor.id).length,1);
  const login2=auth.login(db,'pasajero@voybus.local','VoyBus2026!');
  assert.equal(catalog.favorites(db,auth.resolveToken(db,login2.token).id).length,1);
  catalog.deleteFavorite(db,actor.id,1);
  assert.equal(catalog.favorites(db,actor.id).length,0);
  db.close();
});
test('Auth: invitados, roles, contraseña y revocación',()=>{
  const db=setup();
  const login=auth.login(db,'conductor@voybus.local','VoyBus2026!');
  assert.equal(auth.resolveToken(db,login.token).role,'driver');
  assert.throws(()=>auth.login(db,'conductor@voybus.local','incorrecta'),e=>e.code==='INVALID_CREDENTIALS');
  const guest=auth.guest(db);
  const actor=auth.resolveToken(db,guest.token);
  assert.equal(actor.type,'guest');
  auth.revoke(db,guest.token,actor);
  assert.equal(auth.resolveToken(db,guest.token),null);
  db.close();
});
test('VIA-01: QR/código, un vínculo, viaje inválido, desvinculación',()=>{
  const db=setup();
  const guest=visitor(db);
  assert.throws(()=>travel.resolveVehicle(db,'NOEXISTE'),e=>e.code==='VEHICLE_NOT_FOUND');
  demoTrip(db);
  assert.equal(travel.resolveVehicle(db,'VB-010').trip.status,'active');
  const l=travel.link(db,guest,'VB-010');
  assert.equal(travel.link(db,guest,'VB-010').id,l.id);
  assert.equal(travel.currentLink(db,guest).id,l.id);
  assert.equal(travel.unlink(db,guest).unlinked,true);
  assert.equal(travel.currentLink(db,guest),null);
  db.close();
});
test('VIA-02/03: única solicitud, idempotencia, próxima, cerrada por parada y por término',()=>{
  const db=setup();
  const tripId=demoTrip(db);
  const a=visitor(db),b=passenger(db);
  travel.link(db,a,'VB-010');travel.link(db,b,'VB-010');
  const future=travel.futureStops(db,a);
  assert.equal(future.stops.length,6);
  const dest=future.stops[2];
  const req=travel.submitRequest(db,a,{tripStopId:dest.tripStopId,idempotencyKey:uid});
  assert.equal(req.status,'sent');
  assert.equal(travel.submitRequest(db,a,{tripStopId:dest.tripStopId,idempotencyKey:uid}).id,req.id);
  assert.throws(()=>travel.submitRequest(db,a,{tripStopId:dest.tripStopId,idempotencyKey:'e0090191-59d0-40f7-a64e-a44aacb9cc11'}),e=>e.code==='PENDING_REQUEST_EXISTS');
  const req2=travel.submitRequest(db,b,{tripStopId:dest.tripStopId,idempotencyKey:'f0090191-59d0-40f7-a64e-a44aacb9cc11'});
  assert.notEqual(req.id,req2.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM driver_alert_events WHERE trip_id=?').get(tripId).n,1);
  db.prepare('UPDATE trips SET last_passed_sequence=2 WHERE id=?').run(tripId);
  travel.syncTripRequestStatuses(db,tripId);
  assert.equal(travel.latestRequest(db,a).status,'next');
  db.prepare('UPDATE trips SET last_passed_sequence=3 WHERE id=?').run(tripId);
  travel.syncTripRequestStatuses(db,tripId);
  assert.equal(travel.latestRequest(db,a).status,'closed');
  assert.equal(travel.latestRequest(db,a).closureReason,'stop_passed');
  assert.throws(()=>travel.submitRequest(db,a,{tripStopId:dest.tripStopId,idempotencyKey:'d0090191-59d0-40f7-a64e-a44aacb9cc11'}),e=>e.code==='STOP_ALREADY_PASSED');
  const dest4=travel.futureStops(db,a).stops[0];
  const more=travel.submitRequest(db,a,{tripStopId:dest4.tripStopId,idempotencyKey:'c0090191-59d0-40f7-a64e-a44aacb9cc11'});
  assert.equal(more.status,'next');
  db.prepare("UPDATE trips SET status='finished',finished_at=? WHERE id=?").run(new Date().toISOString(),tripId);
  travel.syncTripRequestStatuses(db,tripId);
  assert.equal(travel.latestRequest(db,a).closureReason,'trip_finished');
  assert.equal(travel.currentLink(db,a),null);
  db.close();
});

test('VIA-02: no permite eludir solicitud pendiente desvinculándose y revinculándose',()=>{
  const db=setup(),actor=visitor(db);
  demoTrip(db);travel.link(db,actor,'VB-010');
  const dest=travel.futureStops(db,actor).stops[3];
  const first=travel.submitRequest(db,actor,{tripStopId:dest.tripStopId,idempotencyKey:uid});
  travel.unlink(db,actor);
  travel.link(db,actor,'VB-010');
  assert.equal(travel.latestRequest(db,actor).id,first.id);
  assert.throws(()=>travel.submitRequest(db,actor,{tripStopId:dest.tripStopId,idempotencyKey:'a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1'}),e=>e.code==='PENDING_REQUEST_EXISTS');
  db.close();
});
test('VIA-01: vínculo concluido no bloquea nuevo viaje, viaje anterior permanece en historial',()=>{
  const db=setup(),actor=visitor(db);
  const id=demoTrip(db);
  travel.link(db,actor,'VB-010');
  db.prepare("UPDATE trips SET status='finished', finished_at=? WHERE id=?").run(new Date().toISOString(),id);
  assert.equal(travel.currentLink(db,actor),null);
  const newId=demoTrip(db);
  assert.notEqual(newId,id);
  assert.equal(travel.link(db,actor,'VB-010').tripId,newId);
  db.close();
});
test('VIA-03: GPS sin actualizar conserva estado y expone ubicación atrasada',()=>{
  const db=setup(),actor=visitor(db);
  const id=demoTrip(db);travel.link(db,actor,'VB-010');
  const dest=travel.futureStops(db,actor).stops[4];
  const req=travel.submitRequest(db,actor,{tripStopId:dest.tripStopId,idempotencyKey:uid});
  db.prepare('UPDATE trip_locations SET sampled_at=? WHERE trip_id=?').run('2020-01-01T00:00:00.000Z',id);
  const tracked=travel.latestRequest(db,actor);
  assert.equal(tracked.status,'sent');
  assert.equal(tracked.locationStale,true);
  assert.equal(tracked.locationUpdatedAt,'2020-01-01T00:00:00.000Z');
  db.close();
});


test('RED-01/RED-02: paraderos DEMO ubicados en corredor geográfico y geometría coherente',()=>{
  const db=setup();
  assert.equal(DEMO_STOPS.length,12);
  for(const p of DEMO_STOPS) {
    const stored=db.prepare('SELECT latitude,longitude FROM stops WHERE id=?').get(p.id);
    assert.equal(stored.latitude,p.latitude);
    assert.equal(stored.longitude,p.longitude);
  }
  for(const id of DEMO_ROUTE_IDS) {
    const route=catalog.route(db,id);
    assert.deepEqual(route.geometry.map(({latitude,longitude})=>({latitude,longitude})),
      route.stops.map(({latitude,longitude})=>({latitude,longitude})));
  }
  assert.notEqual(DEMO_STOPS[1].longitude-DEMO_STOPS[0].longitude,
    DEMO_STOPS[2].longitude-DEMO_STOPS[1].longitude);
  db.close();
});

test('Migración del mapa: preserva favoritos, solicitudes y snapshots de viaje, idempotente',()=>{
  const db=setup();
  const actor=passenger(db);
  catalog.addFavorite(db,actor.id,3);
  const trip=demoTrip(db);
  travel.link(db,actor,'VB-010');
  const dest=travel.futureStops(db,actor).stops[2];
  const request=travel.submitRequest(db,actor,{tripStopId:dest.tripStopId,idempotencyKey:uid});
  const oldSnapshot=db.prepare('SELECT latitude_snapshot,longitude_snapshot FROM trip_stops WHERE trip_id=? AND sequence=3').get(trip);
  // Simular la primera versión: coordenadas generadas en diagonal.
  for(let i=1;i<=12;i++)db.prepare('UPDATE stops SET latitude=?,longitude=? WHERE id=?').run(-23.630-(i-1)*.004,-70.385-(i-1)*.002,i);
  for(const id of DEMO_ROUTE_IDS) {
    const anchors=db.prepare(`SELECT s.latitude,s.longitude FROM route_stops rs
      JOIN stops s ON rs.stop_id=s.id WHERE rs.route_id=? ORDER BY rs.sequence`).all(id);
    db.prepare('UPDATE routes SET geometry_json=? WHERE id=?').run(JSON.stringify(anchors),id);
  }
  assert.equal(applyDemoGeography(db).changed,true);
  assert.equal(applyDemoGeography(db).changed,false);
  assert.equal(catalog.favorites(db,actor.id)[0].code,'P003');
  assert.equal(travel.latestRequest(db,actor).id,request.id);
  assert.deepEqual(db.prepare('SELECT latitude_snapshot,longitude_snapshot FROM trip_stops WHERE trip_id=? AND sequence=3').get(trip),oldSnapshot);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.close();
});
