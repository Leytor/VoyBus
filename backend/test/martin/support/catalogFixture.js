'use strict';

/**
 * SOLO PRUEBAS — catalogo de demostracion.
 *
 * Reemplaza el seed de catalogo de Gianny en las pruebas aisladas de Martin.
 * Lineas, paraderos y trazados son FICTICIOS (coordenadas aproximadas de
 * Antofagasta) y no representan servicios reales.
 */

const STOPS = {
  P001: ['Terminal Sur (demo)', -23.7, -70.418],
  P002: ['Av. Costanera Sur (demo)', -23.68, -70.412],
  P003: ['Balneario (demo)', -23.66, -70.406],
  P004: ['Centro (demo)', -23.645, -70.401],
  P005: ['Plaza Norte (demo)', -23.625, -70.397],
  P006: ['Terminal Norte (demo)', -23.605, -70.394],
  P007: ['Hospital (demo)', -23.647, -70.388],
  P008: ['Universidad (demo)', -23.64, -70.379],
  P009: ['Población Oriente (demo)', -23.626, -70.376],
  P010: ['Cerro Oriente (demo)', -23.615, -70.375],
  P011: ['Barrio Industrial (demo)', -23.59, -70.392],
  P012: ['La Chimba (demo)', -23.578, -70.39],
  P013: ['Terminal La Portada (demo)', -23.562, -70.388],
};

// Trazado de ida: paraderos y puntos intermedios (null = punto de trazado sin paradero).
const LINES = [
  {
    code: 'DEMO-01', name: 'Línea Demo 1 Costanera', color: '#2E7D32', start: 'Terminal Sur', end: 'Terminal Norte',
    path: [['P001'], [-23.69, -70.415], ['P002'], [-23.67, -70.409], ['P003'], [-23.652, -70.403], ['P004'],
      [-23.635, -70.399], ['P005'], [-23.615, -70.3955], ['P006']],
  },
  {
    code: 'DEMO-02', name: 'Línea Demo 2 Centro Oriente', color: '#6A1B9A', start: 'Centro', end: 'Cerro Oriente',
    path: [['P004'], [-23.646, -70.395], ['P007'], [-23.644, -70.383], ['P008'], [-23.633, -70.377], ['P009'], ['P010']],
  },
  {
    code: 'DEMO-03', name: 'Línea Demo 3 Norte', color: '#EF6C00', start: 'Terminal Norte', end: 'La Portada',
    path: [['P006'], [-23.598, -70.393], ['P011'], ['P012'], [-23.57, -70.389], ['P013']],
  },
];

function pointOf(entry) {
  if (typeof entry[0] === 'string') {
    const [, lat, lng] = STOPS[entry[0]];
    return { latitude: lat, longitude: lng };
  }
  return { latitude: entry[0], longitude: entry[1] };
}

async function upsertRoute(db, lineId, direction, startLabel, endLabel, path) {
  const geometry = path.map(pointOf);
  await db.run(
    `INSERT OR IGNORE INTO routes (line_id, direction, start_label, end_label, service_days_json,
                                   start_time_local, end_time_local, geometry_json, enabled)
     VALUES (?, ?, ?, ?, '[1,2,3,4,5,6,7]', '06:00', '23:00', ?, 1)`,
    [lineId, direction, startLabel, endLabel, JSON.stringify(geometry)],
  );
  const route = await db.get(
    'SELECT id FROM routes WHERE line_id = ? AND direction = ? AND start_label = ? AND end_label = ?',
    [lineId, direction, startLabel, endLabel],
  );
  const stopCodes = path.filter((e) => typeof e[0] === 'string').map((e) => e[0]);
  for (let i = 0; i < stopCodes.length; i += 1) {
    const stop = await db.get('SELECT id FROM stops WHERE code = ?', [stopCodes[i]]);
    await db.run('INSERT OR IGNORE INTO route_stops (route_id, stop_id, sequence) VALUES (?, ?, ?)', [
      route.id, stop.id, i + 1,
    ]);
  }
}

async function runDemoCatalogSeed(db) {
  for (const [code, [name, lat, lng]] of Object.entries(STOPS)) {
    await db.run(
      'INSERT INTO stops (code, name, latitude, longitude) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO NOTHING',
      [code, name, lat, lng],
    );
  }
  for (const line of LINES) {
    await db.run(
      `INSERT INTO lines (code, name, color_hex, status) VALUES (?, ?, ?, 'active') ON CONFLICT(code) DO NOTHING`,
      [line.code, line.name, line.color],
    );
    const { id } = await db.get('SELECT id FROM lines WHERE code = ?', [line.code]);
    await upsertRoute(db, id, 'outbound', line.start, line.end, line.path);
    await upsertRoute(db, id, 'inbound', line.end, line.start, line.path.slice().reverse());
  }
  return { lines: LINES.length, stops: Object.keys(STOPS).length };
}

module.exports = { runDemoCatalogSeed };
