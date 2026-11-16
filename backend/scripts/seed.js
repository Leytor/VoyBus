const {getDb,applySchema,closeDb,transaction}=require('../src/lib/db');
const {hashPassword}=require('../src/services/auth');
const {DEMO_STOPS,geometryFromStopIds}=require('./demo-geography');

// Datos de negocio ficticios. Solo las coordenadas DEMO se basan en puntos de
// paradas publicados en OSM; los recorridos NO representan servicios oficiales.
function seed(db) {
  const accounts=[
    [1,'Pasajero de prueba','pasajero@voybus.local','passenger'],
    [2,'Conductor de prueba','conductor@voybus.local','driver'],
    [3,'Administrador de prueba','admin@voybus.local','admin']
  ];
  const insertUser=db.prepare('INSERT OR IGNORE INTO users(id,full_name,email,password_hash,role,enabled,verified_at) VALUES(?,?,?,?,?,1,?)');
  for(const [id,name,email,role] of accounts)insertUser.run(id,name,email,hashPassword('VoyBus2026!'),role,new Date().toISOString());
  const lines=[
    [1,'DEMO-01','Línea demostración Norte','#C62828','active'],
    [2,'DEMO-02','Línea demostración Centro','#1565C0','active'],
    [3,'DEMO-03','Línea demostración Sur','#0F766E','active'],
    [4,'DEMO-04','Línea demostración suspendida','#F9A825','suspended'],
    [5,'DEMO-05','Línea oculta','#475569','disabled']
  ];
  const insertLine=db.prepare('INSERT OR IGNORE INTO lines(id,code,name,color_hex,status) VALUES(?,?,?,?,?)');
  for(const row of lines)insertLine.run(...row);
  const insertStop=db.prepare('INSERT OR IGNORE INTO stops(id,code,name,latitude,longitude) VALUES(?,?,?,?,?)');
  for(const {id,latitude,longitude} of DEMO_STOPS) {
    insertStop.run(id,`P${String(id).padStart(3,'0')}`,`Paradero demostración ${id}`,latitude,longitude);
  }
  const createRoute=db.prepare(`INSERT OR IGNORE INTO routes(id,line_id,direction,start_label,end_label,service_days_json,
    start_time_local,end_time_local,geometry_json,enabled) VALUES(?,?,?,?,?,?,?,?,?,1)`);
  const linkStop=db.prepare('INSERT OR IGNORE INTO route_stops(id,route_id,stop_id,sequence) VALUES(?,?,?,?)');
  for(let lineId=1;lineId<=4;lineId++) {
    for(let directionIndex=0;directionIndex<2;directionIndex++) {
      const id=lineId*10+directionIndex;
      const ids=Array.from({length:6},(_,i)=> ((lineId-1)*2+i)%12+1);
      if(directionIndex===1)ids.reverse();
      const geometry=geometryFromStopIds(ids);
      const direction=directionIndex===0?'outbound':'inbound';
      createRoute.run(id,lineId,direction,`Paradero ${ids[0]}`,`Paradero ${ids[ids.length-1]}`,JSON.stringify([1,2,3,4,5,6,7]),'06:00','23:00',JSON.stringify(geometry));
      ids.forEach((stopId,index)=>linkStop.run(id*100+index+1,id,stopId,index+1));
    }
  }
}
if(require.main===module){
  const db=applySchema(getDb());
  transaction(db,()=>seed(db));
  console.log('Seed creado: 3 líneas activas, 1 suspendida, 1 deshabilitada, 12 paraderos y 3 cuentas demo.');
  closeDb();
}
module.exports={seed};
