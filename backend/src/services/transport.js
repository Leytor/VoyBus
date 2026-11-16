const { ApiError, assert } = require('../lib/errors');
const { pagination, numericId, clean } = require('../lib/utils');

function lines(db, query = {}) {
  const { page, pageSize, offset } = pagination(query);
  const pattern = `%${clean(query.search).slice(0, 80)}%`;
  const base = `FROM lines l WHERE l.status <> 'disabled' AND (l.name LIKE ? OR l.code LIKE ?)`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(pattern, pattern).n;
  const rows = db.prepare(`SELECT l.* ${base} ORDER BY l.code LIMIT ? OFFSET ?`).all(pattern, pattern, pageSize, offset);
  const data = rows.map(l => {
    const edge = db.prepare(`SELECT r.start_label AS startLabel,r.end_label AS endLabel FROM routes r WHERE r.line_id=? AND r.enabled=1 ORDER BY r.id LIMIT 1`).get(l.id);
    return { id: l.id, code: l.code, name: l.name, colorHex: l.color_hex, status: l.status, startLabel: edge?.startLabel || null, endLabel: edge?.endLabel || null };
  });
  return { data, meta: { total, page, pageSize } };
}
function line(db, rawId) {
  const l = db.prepare("SELECT * FROM lines WHERE id = ? AND status <> 'disabled'").get(numericId(rawId));
  assert(l, 404, 'LINE_NOT_FOUND', 'La línea no está disponible.');
  return { id: l.id, code: l.code, name: l.name, colorHex: l.color_hex, status: l.status };
}
function lineRoutes(db, rawId) {
  line(db, rawId);
  return db.prepare(`SELECT id, line_id AS lineId, direction, start_label AS startLabel, end_label AS endLabel,
    service_days_json AS serviceDaysJson, start_time_local AS startTimeLocal, end_time_local AS endTimeLocal
    FROM routes WHERE line_id=? AND enabled=1 ORDER BY direction, id`).all(numericId(rawId))
    .map(({ serviceDaysJson, ...row }) => ({ ...row, serviceDays: JSON.parse(serviceDaysJson) }));
}
function route(db, rawId) {
  const r = db.prepare(`SELECT r.*,l.name AS line_name,l.code AS line_code,l.color_hex AS line_color_hex,l.status AS line_status
    FROM routes r JOIN lines l ON l.id=r.line_id WHERE r.id=? AND r.enabled=1 AND l.status <> 'disabled'`).get(numericId(rawId));
  assert(r, 404, 'ROUTE_NOT_FOUND', 'El recorrido no está disponible.');
  const stops = db.prepare(`SELECT rs.id AS routeStopId, s.id AS stopId, rs.sequence, s.code,s.name,s.latitude,s.longitude
    FROM route_stops rs JOIN stops s ON s.id=rs.stop_id
    WHERE rs.route_id=? ORDER BY rs.sequence`).all(r.id);
  return { id:r.id, lineId:r.line_id, lineCode:r.line_code, lineName:r.line_name, lineColorHex:r.line_color_hex,
    lineStatus:r.line_status, direction:r.direction, serviceDays:JSON.parse(r.service_days_json),
    startTimeLocal:r.start_time_local, endTimeLocal:r.end_time_local, startLabel:r.start_label,
    endLabel:r.end_label, geometry:JSON.parse(r.geometry_json), stops };
}
function stops(db, query = {}) {
  const { page,pageSize,offset } = pagination(query);
  const pattern = `%${clean(query.search).slice(0,80)}%`;
  const hasRoute = query.routeId !== undefined && query.routeId !== '';
  const routeId = hasRoute ? numericId(query.routeId) : null;
  const where = `s.active=1 AND (s.name LIKE ? OR s.code LIKE ?) AND (? IS NULL OR EXISTS
    (SELECT 1 FROM route_stops rs JOIN routes r ON r.id=rs.route_id JOIN lines l ON l.id=r.line_id
     WHERE rs.stop_id=s.id AND rs.route_id=? AND r.enabled=1 AND l.status <> 'disabled'))`;
  const args = [pattern,pattern,routeId,routeId];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM stops s WHERE ${where}`).get(...args).n;
  const data = db.prepare(`SELECT s.id,s.code,s.name,s.latitude,s.longitude FROM stops s WHERE ${where}
    ORDER BY s.code LIMIT ? OFFSET ?`).all(...args,pageSize,offset);
  return { data,meta:{total,page,pageSize} };
}
function stop(db, rawId) {
  const s = db.prepare('SELECT id,code,name,latitude,longitude FROM stops WHERE id=? AND active=1').get(numericId(rawId));
  assert(s,404,'STOP_NOT_FOUND','El paradero no está disponible.');
  const routes = db.prepare(`SELECT r.id AS routeId,r.direction,r.start_label AS startLabel,r.end_label AS endLabel,
    l.id AS lineId,l.name AS lineName,l.code AS lineCode,l.color_hex AS colorHex,l.status AS lineStatus,
    rs.sequence FROM route_stops rs JOIN routes r ON r.id=rs.route_id JOIN lines l ON l.id=r.line_id
    WHERE rs.stop_id=? AND r.enabled=1 AND l.status <> 'disabled' ORDER BY l.code,r.direction`).all(s.id);
  return { ...s,routes };
}
function favorites(db, userId) {
  return db.prepare(`SELECT s.id,s.code,s.name,s.latitude,s.longitude FROM favorite_stops f
    JOIN stops s ON s.id=f.stop_id WHERE f.user_id=? AND s.active=1 ORDER BY s.name`).all(userId);
}
function addFavorite(db, userId, stopId) {
  stop(db,stopId);
  db.prepare('INSERT OR IGNORE INTO favorite_stops(user_id,stop_id) VALUES(?,?)').run(userId,numericId(stopId));
  return { saved:true,stopId:numericId(stopId) };
}
function deleteFavorite(db,userId,stopId) {
  db.prepare('DELETE FROM favorite_stops WHERE user_id=? AND stop_id=?').run(userId,numericId(stopId));
  return { saved:false,stopId:numericId(stopId) };
}
module.exports = { lines,line,lineRoutes,route,stops,stop,favorites,addFavorite,deleteFavorite };
