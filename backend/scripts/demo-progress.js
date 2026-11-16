// Herramienta de demostración SIN GPS: NO es una implementación de VEH-01 de Martín.
const {getDb,applySchema,closeDb,transaction}=require('../src/lib/db');
const {syncTripRequestStatuses}=require('../src/services/travel');
const db=applySchema(getDb());
const trip=db.prepare(`SELECT t.id FROM trips t JOIN shift_trips st ON st.id=t.shift_trip_id
  JOIN shifts sh ON sh.id=st.shift_id JOIN vehicles v ON v.id=sh.vehicle_id
  WHERE v.code='VB-010' AND t.status='active' ORDER BY t.id DESC LIMIT 1`).get();
if(!trip){console.error('No hay viaje DEMO activo. Ejecuta npm run demo:trip.');process.exitCode=1;}
else {
  const value=process.argv[2];
  transaction(db,()=>{
    if(value==='finish')db.prepare("UPDATE trips SET status='finished',finished_at=? WHERE id=?").run(new Date().toISOString(),trip.id);
    else {
      const n=Number(value);
      const max=db.prepare('SELECT MAX(sequence) n FROM trip_stops WHERE trip_id=?').get(trip.id).n;
      if(!Number.isSafeInteger(n)||n<0||n>max)throw Error(`Secuencia inválida. Usa 0..${max} o finish.`);
      db.prepare('UPDATE trips SET last_passed_sequence=? WHERE id=?').run(n,trip.id);
      const stop=db.prepare('SELECT latitude_snapshot AS latitude,longitude_snapshot AS longitude FROM trip_stops WHERE trip_id=? AND sequence=?').get(trip.id,Math.max(1,n));
      db.prepare('INSERT INTO trip_locations(trip_id,latitude,longitude,accuracy_meters,sampled_at) VALUES(?,?,?,?,?)').run(trip.id,stop.latitude,stop.longitude,5,new Date().toISOString());
    }
    syncTripRequestStatuses(db,trip.id);
  });
  console.log(`Viaje ${trip.id} actualizado: ${value}. Prueba exclusivamente local de Gianny.`);
}
closeDb();
