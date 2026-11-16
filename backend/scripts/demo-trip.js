const {getDb,applySchema,closeDb,transaction}=require('../src/lib/db');
const {seed}=require('./seed');
const {syncTripRequestStatuses}=require('../src/services/travel');
function demoTrip(db) {
  const vehicle=db.prepare("SELECT id FROM vehicles WHERE code='VB-010'").get();
  if(!vehicle)db.prepare(`INSERT INTO vehicles(code,plate,capacity,status) VALUES('VB-010','DEMO-010',30,'operational')`).run();
  const vehicleId=db.prepare("SELECT id FROM vehicles WHERE code='VB-010'").get().id;
  const active=db.prepare(`SELECT t.id FROM trips t JOIN shift_trips st ON st.id=t.shift_trip_id
    JOIN shifts sh ON sh.id=st.shift_id WHERE sh.vehicle_id=? AND t.status='active'`).get(vehicleId);
  if(active)return active.id;
  const start=new Date(Date.now()-5*60000).toISOString();
  const end=new Date(Date.now()+4*3600000).toISOString();
  const shiftId=Number(db.prepare("INSERT INTO shifts(driver_user_id,vehicle_id,planned_start_at,planned_end_at,actual_start_at,status) VALUES(2,?,?,?,?,'active')").run(vehicleId,start,end,start).lastInsertRowid);
  const shiftTripId=Number(db.prepare('INSERT INTO shift_trips(shift_id,route_id,sequence,planned_start_at,planned_end_at) VALUES(?,10,1,?,?)').run(shiftId,start,end).lastInsertRowid);
  const tripId=Number(db.prepare("INSERT INTO trips(shift_trip_id,status,started_at,last_passed_sequence) VALUES(?,'active',?,0)").run(shiftTripId,start).lastInsertRowid);
  const routeStops=db.prepare(`SELECT rs.sequence,s.id,s.code,s.name,s.latitude,s.longitude FROM route_stops rs
    JOIN stops s ON s.id=rs.stop_id WHERE rs.route_id=10 ORDER BY rs.sequence`).all();
  const insert=db.prepare(`INSERT INTO trip_stops(trip_id,sequence,stop_id,stop_code_snapshot,stop_name_snapshot,latitude_snapshot,longitude_snapshot)
    VALUES(?,?,?,?,?,?,?)`);
  for(const s of routeStops)insert.run(tripId,s.sequence,s.id,s.code,s.name,s.latitude,s.longitude);
  db.prepare('INSERT INTO trip_locations(trip_id,latitude,longitude,accuracy_meters,sampled_at) VALUES(?,?,?,?,?)').run(tripId,routeStops[0].latitude,routeStops[0].longitude,5,new Date().toISOString());
  return tripId;
}
if(require.main===module){
  const db=applySchema(getDb());
  const id=transaction(db,()=>{seed(db);return demoTrip(db);});
  console.log(`Viaje DEMO activo ID ${id}, vehículo VB-010. QR: voybus://vehicle/VB-010`);
  closeDb();
}
module.exports={demoTrip};
