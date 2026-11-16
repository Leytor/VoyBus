// Actualiza SOLO coordenadas y geometrías de los registros DEMO existentes.
// Mantiene claves, favoritos, cuentas, solicitudes y snapshots históricos de viajes.
const fs=require('node:fs');
const path=require('node:path');
const {getDb,closeDb,transaction}=require('../src/lib/db');
const {DEMO_STOPS,DEMO_ROUTE_IDS}=require('./demo-geography');

function verifyDemoCatalog(db) {
  const expected=DEMO_STOPS;
  for(const p of expected) {
    const existing=db.prepare('SELECT code,name FROM stops WHERE id=?').get(p.id);
    if(!existing || existing.code!==`P${String(p.id).padStart(3,'0')}` ||
      existing.name!==`Paradero demostración ${p.id}`) {
      throw new Error(`Paradero ${p.id} no coincide con el seed DEMO. No se modificó nada.`);
    }
  }
  for(const routeId of DEMO_ROUTE_IDS) {
    const existing=db.prepare(`SELECT r.id,l.code FROM routes r JOIN lines l ON l.id=r.line_id WHERE r.id=?`).get(routeId);
    const lineNumber=Math.floor(routeId/10);
    if(!existing||existing.code!==`DEMO-${String(lineNumber).padStart(2,'0')}`) {
      throw new Error(`Recorrido ${routeId} no coincide con el seed DEMO. No se modificó nada.`);
    }
  }
}
function hasLegacyGeometry(db) {
  for(const p of DEMO_STOPS) {
    const existing=db.prepare('SELECT latitude,longitude FROM stops WHERE id=?').get(p.id);
    if(Math.abs(existing.latitude-p.latitude)>1e-8 || Math.abs(existing.longitude-p.longitude)>1e-8) return true;
  }
  for(const routeId of DEMO_ROUTE_IDS) {
    const current=db.prepare('SELECT geometry_json FROM routes WHERE id=?').get(routeId);
    const expected=db.prepare(`SELECT s.latitude,s.longitude FROM route_stops rs
      JOIN stops s ON s.id=rs.stop_id WHERE rs.route_id=? ORDER BY rs.sequence`).all(routeId);
    if(JSON.stringify(JSON.parse(current.geometry_json))!==JSON.stringify(expected)) return true;
  }
  return false;
}
function applyDemoGeography(db) {
  verifyDemoCatalog(db);
  if(!hasLegacyGeometry(db))return {changed:false,stops:0,routes:0};
  return transaction(db,()=>{
    const updateStop=db.prepare('UPDATE stops SET latitude=?,longitude=? WHERE id=?');
    for(const p of DEMO_STOPS) updateStop.run(p.latitude,p.longitude,p.id);
    const updateRoute=db.prepare('UPDATE routes SET geometry_json=? WHERE id=?');
    for(const routeId of DEMO_ROUTE_IDS) {
      const anchors=db.prepare(`SELECT s.latitude,s.longitude FROM route_stops rs
        JOIN stops s ON s.id=rs.stop_id WHERE rs.route_id=? ORDER BY rs.sequence`).all(routeId);
      if(anchors.length<2)throw new Error(`Recorrido DEMO ${routeId} tiene menos de dos paraderos.`);
      updateRoute.run(JSON.stringify(anchors.map(p=>({latitude:p.latitude,longitude:p.longitude}))),routeId);
    }
    return {changed:true,stops:DEMO_STOPS.length,routes:DEMO_ROUTE_IDS.length};
  });
}
function backupDb(db) {
  const directory=path.join(__dirname,'..','data','backups');
  fs.mkdirSync(directory,{recursive:true});
  const now=new Date().toISOString().replace(/[:.]/g,'-');
  const filename=path.join(directory,`voybus-antes-mapa-${now}.sqlite`);
  // VACUUM INTO genera una copia de seguridad CONSISTENTE incluso con SQLite WAL.
  db.exec(`VACUUM INTO '${filename.replace(/'/g,"''")}'`);
  return filename;
}
if(require.main===module) {
  let db;
  try {
    db=getDb();
    verifyDemoCatalog(db);
    if(!hasLegacyGeometry(db))console.log('Mapa DEMO ya actualizado. No se realizaron cambios.');
    else {
      const count=db.prepare("SELECT COUNT(*) AS n FROM trips WHERE status='active'").get().n;
      if(count>0) {
        console.error(`Hay ${count} viaje(s) activo(s). Finalízalos primero para mantener la coherencia del mapa y de los snapshots.`);
        console.error('Para VB-010 ejecuta: node scripts/demo-progress.js finish');
        process.exitCode=2;
      } else {
        const backup=backupDb(db);
        const result=applyDemoGeography(db);
        console.log(`Copia de seguridad: ${backup}`);
        console.log(`Mapa actualizado: ${result.stops} paraderos y ${result.routes} recorridos DEMO.`);
        console.log('No se alteraron usuarios, favoritos, solicitudes ni viajes históricos.');
      }
    }
  } catch(error) { console.error(`No se pudo actualizar el mapa: ${error.message}`);process.exitCode=1; }
  finally {if(db)closeDb();}
}
module.exports={applyDemoGeography,verifyDemoCatalog};
