// Referencias geográficas de paradas de autobús registradas en OpenStreetMap,
// consultadas mediante Mapcarta en noviembre de 2026.
// ATENCIÓN: IDs P001..P012 y líneas DEMO ficticios. No se verificó una ruta vial
// oficial, sentidos habilitados ni coincidencia exacta de cada segmento con la calzada.
// NO reemplazar estos datos por posiciones de producción sin verificar la red vial.
// Las fuentes por parada se documentan en docs/FUENTES_Y_LIMITACIONES_MAPA.md.
const DEMO_STOPS = Object.freeze([
  {id:1, latitude:-23.65861, longitude:-70.39653}, // Copiapó / Avenida Argentina
  {id:2, latitude:-23.65962, longitude:-70.39622}, // Argentina / Salvador Reyes
  {id:3, latitude:-23.66063, longitude:-70.39722}, // General Velásquez / Av. Argentina
  {id:4, latitude:-23.66344, longitude:-70.39730}, // Argentina / Antonio Toro
  {id:5, latitude:-23.67029, longitude:-70.39960}, // Avenida Argentina / Chillán
  {id:6, latitude:-23.67253, longitude:-70.40074}, // Avenida Argentina / Concepción
  {id:7, latitude:-23.67398, longitude:-70.40198}, // Argentina / Homero Ávila
  {id:8, latitude:-23.67485, longitude:-70.40275}, // Argentina / Nicanor Plaza
  {id:9, latitude:-23.67804, longitude:-70.40555}, // Av. Argentina / Enrique Soro
  {id:10,latitude:-23.68240, longitude:-70.40907}, // Av. Argentina / Altos del Mar
  {id:11,latitude:-23.68558, longitude:-70.40973}, // Avenida Argentina / Trumao
  {id:12,latitude:-23.69020, longitude:-70.41018}  // Argentina / Máfil
]);
const DEMO_ROUTE_IDS = Object.freeze([10,11,20,21,30,31,40,41]);
function demoStop(id) {
  const found=DEMO_STOPS.find(p=>p.id===id);
  if(!found) throw new Error(`Paradero DEMO no configurado: ${id}`);
  return found;
}
function geometryFromStopIds(ids) {
  return ids.map(id=>{const {latitude,longitude}=demoStop(id);return {latitude,longitude};});
}
module.exports={DEMO_STOPS,DEMO_ROUTE_IDS,demoStop,geometryFromStopIds};
