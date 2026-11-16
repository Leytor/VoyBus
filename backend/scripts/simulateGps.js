'use strict';

/**
 * Herramienta de demostracion — GPS SIMULADO (no es parte de la app).
 *
 * Inicia sesión como conductores demo, inicia su turno y su primer viaje
 * pendiente, y envía lecturas GPS sintéticas a lo largo del recorrido usando
 * los MISMOS endpoints de la app (POST /driver/trips/:id/locations).
 * Sirve para tener varios vehículos en el mapa durante la demostración.
 * En el video debe declararse como "GPS simulado de vehículos demo"; el
 * conductor real usa el GPS de su teléfono.
 *
 * Requiere el servidor integrado corriendo y el seed de Martin cargado.
 * Uso: npm run simulate:gps -- --drivers=2,3,4 --speed=15 --interval=3 [--finish]
 * Variables: API_URL (por defecto http://localhost:3000/api/v1), DEMO_PASSWORD.
 */
const API = process.env.API_URL || 'http://localhost:3000/api/v1';
const PASSWORD = process.env.DEMO_PASSWORD || 'VoyBus.Demo2026';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']),
);
const DRIVERS = (args.drivers || '2,3,4').split(',').map((n) => `conductor${n.trim()}.demo@voybus.local`);
const SPEED = Number(args.speed || 15); // m/s
const INTERVAL = Number(args.interval || 3); // s
const FINISH = args.finish === 'true';

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(json.error ? `${json.error.code}: ${json.error.message}` : `HTTP ${res.status}`);
    error.code = json.error && json.error.code;
    throw error;
  }
  return json.data;
}

const toRad = (d) => (d * Math.PI) / 180;
function distance(a, b) {
  const x = toRad(b.longitude - a.longitude) * Math.cos(toRad((a.latitude + b.latitude) / 2));
  const y = toRad(b.latitude - a.latitude);
  return Math.sqrt(x * x + y * y) * 6371000;
}

function pointAt(path, cumulative, along) {
  for (let i = 1; i < path.length; i += 1) {
    if (along <= cumulative[i]) {
      const t = (along - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1] || 1);
      return {
        latitude: path[i - 1].latitude + t * (path[i].latitude - path[i - 1].latitude),
        longitude: path[i - 1].longitude + t * (path[i].longitude - path[i - 1].longitude),
      };
    }
  }
  return path[path.length - 1];
}

async function prepareDriver(email) {
  const { token } = await call('POST', '/auth/login', null, { email, password: PASSWORD });
  const shifts = await call('GET', '/driver/shifts', token);
  const shift = shifts.find((s) => s.status === 'active') || shifts.find((s) => s.status === 'scheduled');
  if (!shift) throw new Error(`${email}: no tiene turnos vigentes (ejecuta npm run seed)`);
  if (shift.status === 'scheduled') await call('POST', `/driver/shifts/${shift.id}/start`, token);

  let planned = shift.trips.find((t) => t.trip && t.trip.status === 'active');
  let tripId = planned && planned.trip.tripId;
  if (!planned) {
    planned = shift.trips.find((t) => !t.trip);
    if (!planned) throw new Error(`${email}: no le quedan viajes por realizar en el turno`);
    tripId = (await call('POST', `/driver/shift-trips/${planned.shiftTripId}/start`, token)).tripId;
  }
  const route = await call('GET', `/routes/${planned.routeId}`, null);
  const path = route.geometry.length >= 2 ? route.geometry : route.stops;
  const cumulative = [0];
  for (let i = 1; i < path.length; i += 1) cumulative.push(cumulative[i - 1] + distance(path[i - 1], path[i]));
  console.log(`${email}: viaje ${tripId} (${planned.line.code} ${planned.direction}) — GPS SIMULADO`);
  return { email, token, tripId, path, cumulative, along: 0, done: false };
}

async function tick(sim) {
  if (sim.done) return;
  const length = sim.cumulative[sim.cumulative.length - 1];
  sim.along = Math.min(length, sim.along + SPEED * INTERVAL);
  const p = pointAt(sim.path, sim.cumulative, sim.along);
  try {
    const result = await call('POST', `/driver/trips/${sim.tripId}/locations`, sim.token, {
      latitude: p.latitude,
      longitude: p.longitude,
      accuracyMeters: 6,
      sampledAt: new Date().toISOString(),
    });
    process.stdout.write(`  ${sim.email.split('.')[0]} → paradero superado: ${result.lastPassedSequence}\n`);
  } catch (error) {
    console.warn(`  ${sim.email}: ${error.message}`);
    if (error.code === 'TRIP_NOT_ACTIVE') sim.done = true;
  }
  if (sim.along >= length) {
    sim.done = true;
    if (FINISH) {
      await call('POST', `/driver/trips/${sim.tripId}/finish`, sim.token).catch(() => undefined);
      console.log(`${sim.email}: viaje finalizado al llegar al término`);
    } else {
      console.log(`${sim.email}: llegó al término (el viaje sigue activo; usa --finish para cerrarlo)`);
    }
  }
}

async function main() {
  const sims = [];
  for (const email of DRIVERS) {
    try {
      sims.push(await prepareDriver(email));
    } catch (error) {
      console.warn(error.message);
    }
  }
  if (!sims.length) process.exit(1);
  const timer = setInterval(async () => {
    await Promise.all(sims.map(tick));
    if (sims.every((s) => s.done)) {
      clearInterval(timer);
      console.log('Simulación terminada.');
    }
  }, INTERVAL * 1000);
}

main();
