'use strict';

/**
 * Avance confiable de un viaje sobre su recorrido (VEH-01; consumido por VIA-03).
 *
 * Reglas del contrato (ARQUITECTURA_Y_REGLAS.md, seccion 5):
 *  - Proyectar cada lectura GPS sobre la geometria del recorrido.
 *  - El avance es monotono: last_passed_sequence nunca retrocede.
 *  - No avanzar por una lectura aislada ni por cercania lateral a un paradero:
 *    se exigen `confirmSamples` lecturas recientes, todas cerca de la ruta y
 *    todas mas alla del paradero + `passMarginMeters`.
 *  - Si el GPS no es fiable, se conserva el valor anterior.
 *
 * Funciones puras (sin base de datos) para poder probarlas de forma aislada.
 */

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Proyeccion equirectangular local; suficiente a escala de ciudad. */
function makeProjector(referenceLatitude) {
  const cosRef = Math.cos(toRad(referenceLatitude));
  return ({ latitude, longitude }) => ({
    x: EARTH_RADIUS_M * toRad(longitude) * cosRef,
    y: EARTH_RADIUS_M * toRad(latitude),
  });
}

function haversineMeters(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function toPoint(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const latitude = raw.latitude ?? raw.lat;
  const longitude = raw.longitude ?? raw.lng ?? raw.lon;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

/**
 * Construye la polilinea del viaje. Usa `routes.geometry_json` (arreglo de
 * {latitude, longitude}, formato del contrato). Si no hay geometria valida,
 * usa los paraderos del viaje en orden como aproximacion.
 */
function buildPolyline(geometryJson, tripStops) {
  let points = [];
  try {
    const parsed = typeof geometryJson === 'string' ? JSON.parse(geometryJson) : geometryJson;
    if (Array.isArray(parsed)) points = parsed.map(toPoint).filter(Boolean);
  } catch {
    points = [];
  }
  if (points.length < 2) {
    points = tripStops
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => ({ latitude: s.latitude, longitude: s.longitude }));
  }
  if (points.length < 2) return null;

  const project = makeProjector(points[0].latitude);
  const xy = points.map(project);
  const cumulative = [0];
  for (let i = 1; i < xy.length; i += 1) {
    cumulative.push(cumulative[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y));
  }
  return { project, xy, cumulative, length: cumulative[cumulative.length - 1] };
}

/**
 * Proyecta un punto sobre la polilinea considerando solo tramos que terminan
 * despues de `minAlong` (evita confundir tramos de ida/vuelta en recorridos
 * circulares). Devuelve { along, lateral } o null.
 */
function projectOnPolyline(polyline, point, minAlong = 0) {
  const p = polyline.project(point);
  let best = null;
  for (let i = 0; i < polyline.xy.length - 1; i += 1) {
    if (polyline.cumulative[i + 1] < minAlong) continue;
    const a = polyline.xy[i];
    const b = polyline.xy[i + 1];
    const segLen = polyline.cumulative[i + 1] - polyline.cumulative[i];
    let t = 0;
    if (segLen > 0) {
      t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (segLen * segLen);
      t = Math.max(0, Math.min(1, t));
    }
    let along = polyline.cumulative[i] + t * segLen;
    if (along < minAlong) along = minAlong;
    const qx = a.x + t * (b.x - a.x);
    const qy = a.y + t * (b.y - a.y);
    const lateral = Math.hypot(p.x - qx, p.y - qy);
    if (!best || lateral < best.lateral - 1e-6) best = { along, lateral };
  }
  return best;
}

/** Distancia recorrida hasta cada paradero, en orden y sin retroceder. */
function computeStopDistances(polyline, tripStops) {
  const ordered = tripStops.slice().sort((a, b) => a.sequence - b.sequence);
  let previous = 0;
  return ordered.map((stop) => {
    const projected = projectOnPolyline(polyline, stop, previous);
    const along = projected ? Math.max(projected.along, previous) : previous;
    previous = along;
    return { sequence: stop.sequence, along };
  });
}

/**
 * Calcula el nuevo last_passed_sequence.
 * @param {object} input
 * @param {string|Array} input.geometryJson   routes.geometry_json
 * @param {Array} input.tripStops             [{ sequence, latitude, longitude }]
 * @param {number} input.lastPassedSequence   valor actual (monotono)
 * @param {Array} input.recentSamples         lecturas validas, la mas reciente primero
 *                                            [{ latitude, longitude, sampledAt }]
 * @param {object} input.gps                  config.gps
 * @returns {{ lastPassedSequence: number, reliable: boolean, reason?: string }}
 */
function evaluateProgress({ geometryJson, tripStops, lastPassedSequence, recentSamples, gps }) {
  const unchanged = (reason) => ({ lastPassedSequence, reliable: false, reason });
  if (!tripStops.length) return unchanged('no_stops');

  const polyline = buildPolyline(geometryJson, tripStops);
  if (!polyline) return unchanged('no_geometry');

  const samples = recentSamples.slice(0, gps.confirmSamples);
  if (samples.length < gps.confirmSamples) return unchanged('not_enough_samples');

  const newest = Date.parse(samples[0].sampledAt);
  const oldest = Date.parse(samples[samples.length - 1].sampledAt);
  if (newest - oldest > gps.confirmWindowSeconds * 1000) return unchanged('samples_too_far_apart');

  const stopDistances = computeStopDistances(polyline, tripStops);
  const passed = stopDistances.filter((s) => s.sequence <= lastPassedSequence);
  const baseAlong = passed.length ? passed[passed.length - 1].along : 0;
  const minAlong = Math.max(0, baseAlong - gps.backtrackMeters);

  let confirmedAlong = Infinity;
  for (const sample of samples) {
    const projected = projectOnPolyline(polyline, sample, minAlong);
    if (!projected || projected.lateral > gps.maxLateralMeters) return unchanged('off_route');
    confirmedAlong = Math.min(confirmedAlong, projected.along);
  }

  let next = lastPassedSequence;
  for (const stop of stopDistances) {
    if (stop.sequence <= lastPassedSequence) continue;
    if (confirmedAlong >= stop.along + gps.passMarginMeters) next = stop.sequence;
    else break;
  }
  return { lastPassedSequence: next, reliable: true };
}

module.exports = {
  haversineMeters,
  buildPolyline,
  projectOnPolyline,
  computeStopDistances,
  evaluateProgress,
};
