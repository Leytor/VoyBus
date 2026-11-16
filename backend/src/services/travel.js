const { ApiError, assert } = require('../lib/errors');
const { now, locationSummary, numericId, clean } = require('../lib/utils');
const { transaction } = require('../lib/db');

function actorWhere(actor) {
  assert(actor && (actor.role === 'passenger' || actor.type === 'guest'),403,'FORBIDDEN','Solo pasajeros e invitados pueden vincularse.');
  return actor.type === 'guest' ? { column:'guest_session_id', id:actor.guestSessionId } : { column:'user_id',id:actor.id };
}
function getLink(db, actor, activeOnly=true) {
  const {column,id}=actorWhere(actor);
  return db.prepare(`SELECT tl.*,v.code AS vehicle_code,l.code AS line_code,r.id AS route_id,r.direction,
    t.status AS trip_status,t.last_passed_sequence
    FROM trip_links tl JOIN trips t ON t.id=tl.trip_id
    JOIN shift_trips st ON st.id=t.shift_trip_id JOIN shifts sh ON sh.id=st.shift_id
    JOIN vehicles v ON v.id=sh.vehicle_id JOIN routes r ON r.id=st.route_id
    JOIN lines l ON l.id=r.line_id
    WHERE tl.${column}=? ${activeOnly?'AND tl.ended_at IS NULL':''} ORDER BY tl.id DESC LIMIT 1`).get(id);
}
function serializeLink(r) {
  return r ? { id:r.id, tripId:r.trip_id, vehicleCode:r.vehicle_code, lineCode:r.line_code,
    routeId:r.route_id,direction:r.direction, linkedAt:r.linked_at,tripStatus:r.trip_status } : null;
}
function resolveVehicle(db, vehicleCode) {
  const code=clean(vehicleCode).toUpperCase();
  assert(/^[A-Z0-9-]{3,32}$/.test(code),422,'INVALID_VEHICLE_CODE','El código del vehículo no es válido.');
  const v=db.prepare('SELECT id,code,enabled FROM vehicles WHERE code=?').get(code);
  assert(v && v.enabled,404,'VEHICLE_NOT_FOUND','No se encontró ese vehículo.');
  const trip=db.prepare(`SELECT t.id,t.status,l.id AS lineId,l.code AS lineCode,l.name AS lineName,r.id AS routeId,r.direction
    FROM trips t JOIN shift_trips st ON st.id=t.shift_trip_id JOIN shifts sh ON sh.id=st.shift_id
    JOIN routes r ON r.id=st.route_id JOIN lines l ON l.id=r.line_id
    WHERE sh.vehicle_id=? AND t.status='active' ORDER BY t.id DESC LIMIT 1`).get(v.id);
  assert(trip,409,'NO_ACTIVE_TRIP','Este vehículo no tiene un viaje en curso.');
  return { vehicle:{id:v.id,code:v.code},trip:{id:trip.id,status:trip.status,lineId:trip.lineId,lineCode:trip.lineCode,lineName:trip.lineName,routeId:trip.routeId,direction:trip.direction} };
}
function link(db, actor, vehicleCode) {
  return transaction(db, () => {
    const found=resolveVehicle(db,vehicleCode);
    let previous=getLink(db,actor,true);
    if (previous && previous.trip_status!=='active') {
      syncTripRequestStatuses(db,previous.trip_id);
      previous=getLink(db,actor,true);
    }
    if (previous) {
      assert(previous.trip_id===found.trip.id,409,'ACTIVE_TRIP_LINK_EXISTS','Ya estás vinculado a otro viaje. Desvincúlate primero.');
      return serializeLink(previous);
    }
    const {column,id}=actorWhere(actor);
    const stamp=now();
    const result=db.prepare(`INSERT INTO trip_links(trip_id,${column},linked_at) VALUES(?,?,?)`).run(found.trip.id,id,stamp);
    return serializeLink(getLink(db,actor,true)) || {id:Number(result.lastInsertRowid),tripId:found.trip.id,linkedAt:stamp};
  });
}
function currentLink(db,actor) {
  let r=getLink(db,actor,true);
  if(r && r.trip_status!=='active') {
    transaction(db,()=>syncTripRequestStatuses(db,r.trip_id));
    r=null;
  }
  return r ? serializeLink(r) : null;
}
function unlink(db,actor) {
  const r=getLink(db,actor,true);
  if (r) db.prepare('UPDATE trip_links SET ended_at=? WHERE id=? AND ended_at IS NULL').run(now(),r.id);
  return { unlinked:true };
}
function futureStops(db,actor) {
  const r=getLink(db,actor,true);
  assert(r && r.trip_status==='active',409,'NO_ACTIVE_TRIP_LINK','No estás vinculado a un viaje activo.');
  const stops=db.prepare(`SELECT id AS tripStopId,stop_id AS stopId,sequence,stop_code_snapshot AS code,
    stop_name_snapshot AS name FROM trip_stops WHERE trip_id=? AND sequence>? ORDER BY sequence`).all(r.trip_id,r.last_passed_sequence)
    .map(s=>({...s,isNext:s.sequence===r.last_passed_sequence+1}));
  return {tripId:r.trip_id,lastPassedSequence:r.last_passed_sequence,...locationSummary(db,r.trip_id),stops};
}
// Martín debe llamar esta función en la transacción que actualiza el avance o finaliza el viaje.
// También se usa en las lecturas del pasajero como recuperación ante cambios externos.
function syncTripRequestStatuses(db, tripId) {
  const t=db.prepare('SELECT status,last_passed_sequence FROM trips WHERE id=?').get(tripId);
  if (!t) return;
  const stamp=now();
  if (t.status==='finished'||t.status==='cancelled') {
    db.prepare(`UPDATE stop_requests SET status='closed',closure_reason='trip_finished',closed_at=?
      WHERE trip_id=? AND status IN ('sent','next')`).run(stamp,tripId);
    db.prepare(`UPDATE trip_links SET ended_at=COALESCE(ended_at,?) WHERE trip_id=? AND ended_at IS NULL`).run(stamp,tripId);
    return;
  }
  if (t.status!=='active') return;
  db.prepare(`UPDATE stop_requests SET status='closed',closure_reason='stop_passed',closed_at=?
    WHERE trip_id=? AND status IN ('sent','next') AND trip_stop_id IN
    (SELECT id FROM trip_stops WHERE trip_id=? AND sequence<=?)`).run(stamp,tripId,tripId,t.last_passed_sequence);
  db.prepare(`UPDATE stop_requests SET status='next' WHERE trip_id=? AND status='sent'
    AND trip_stop_id IN (SELECT id FROM trip_stops WHERE trip_id=? AND sequence=?)`).run(tripId,tripId,t.last_passed_sequence+1);
}
function serializeRequest(db,req) {
  if (!req) return null;
  const s=db.prepare('SELECT sequence,stop_code_snapshot AS code,stop_name_snapshot AS name FROM trip_stops WHERE id=?').get(req.trip_stop_id);
  return {id:req.id,tripId:req.trip_id,tripStopId:req.trip_stop_id,
    destination:s,status:req.status,requestedAt:req.requested_at,
    closedAt:req.closed_at,closureReason:req.closure_reason,...locationSummary(db,req.trip_id)};
}
function latestRequest(db,actor) {
  const {column,id}=actorWhere(actor);
  const link=db.prepare(`SELECT id,trip_id FROM trip_links WHERE ${column}=? ORDER BY id DESC LIMIT 1`).get(id);
  if (!link) return null;
  transaction(db,()=>syncTripRequestStatuses(db,link.trip_id));
  // Mostrar también una solicitud aún pendiente del mismo viaje, aunque el usuario se haya desvinculado y vuelto a vincular.
  const req=db.prepare(`SELECT sr.* FROM stop_requests sr JOIN trip_links tl ON tl.id=sr.trip_link_id
    WHERE tl.${column}=? AND sr.trip_id=? ORDER BY sr.id DESC LIMIT 1`).get(id,link.trip_id);
  return serializeRequest(db,req);
}
function submitRequest(db,actor,body={}) {
  return transaction(db,()=>{
    const link=getLink(db,actor,true);
    assert(link && link.trip_status==='active',409,'NO_ACTIVE_TRIP_LINK','Debes vincularte con un viaje en curso.');
    const id=numericId(body.tripStopId);
    const key=clean(body.idempotencyKey);
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key),422,'INVALID_IDEMPOTENCY_KEY','La clave única de la solicitud no es válida.');
    syncTripRequestStatuses(db,link.trip_id);
    const repeated=db.prepare('SELECT * FROM stop_requests WHERE trip_link_id=? AND idempotency_key=?').get(link.id,key);
    if(repeated) {
      assert(repeated.trip_stop_id===id,409,'IDEMPOTENCY_MISMATCH','La clave de solicitud ya corresponde a otro destino.');
      return serializeRequest(db,repeated);
    }
    const dest=db.prepare('SELECT id,sequence FROM trip_stops WHERE id=? AND trip_id=?').get(id,link.trip_id);
    assert(dest,422,'STOP_NOT_ON_TRIP','El paradero no corresponde a este viaje.');
    assert(dest.sequence>link.last_passed_sequence,409,'STOP_ALREADY_PASSED','El paradero ya fue superado.');
    const {column:ownerColumn,id:ownerId}=actorWhere(actor);
    const outstanding=db.prepare(`SELECT sr.id FROM stop_requests sr JOIN trip_links tl ON tl.id=sr.trip_link_id
      WHERE tl.${ownerColumn}=? AND sr.trip_id=? AND sr.status IN ('sent','next') LIMIT 1`).get(ownerId,link.trip_id);
    assert(!outstanding,409,'PENDING_REQUEST_EXISTS','Ya tienes una solicitud pendiente en este viaje.');
    const status=dest.sequence===link.last_passed_sequence+1?'next':'sent';
    const result=db.prepare(`INSERT INTO stop_requests(trip_id,trip_link_id,trip_stop_id,status,idempotency_key,requested_at)
      VALUES(?,?,?,?,?,?)`).run(link.trip_id,link.id,id,status,key,now());
    // Evento único por paradero: el contador lo calcula el módulo de Martín.
    db.prepare('INSERT OR IGNORE INTO driver_alert_events(trip_id,trip_stop_id,type) VALUES(?,?,?)').run(link.trip_id,id,'stop_request');
    return serializeRequest(db,db.prepare('SELECT * FROM stop_requests WHERE id=?').get(Number(result.lastInsertRowid)));
  });
}
module.exports={ resolveVehicle,link,currentLink,unlink,futureStops,latestRequest,submitRequest,syncTripRequestStatuses };
