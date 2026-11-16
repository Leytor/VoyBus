'use strict';

/**
 * Seed complementario de Martin (idempotente).
 *
 * Agrega vehiculos (>= 10), conductores demo y turnos con viajes planificados
 * SOBRE el catalogo de Gianny (lineas, recorridos y paraderos), resolviendo
 * los recorridos por codigo de linea y sentido; nunca asume IDs numericos.
 * No borra ni modifica datos existentes.
 *
 * DATOS DE DEMOSTRACION: patentes, nombres y correos son ficticios.
 *
 * Uso:
 *   const { runMartinSeed } = require('./seeds/martinSeed');
 *   await runMartinSeed({ db, hashPassword, driverPassword });
 *   - db: adaptador get/all/run/transaction (el mismo de los modulos)
 *   - hashPassword(plain): funcion de hash de la autenticacion de Gianny.
 *     Si se omite, los conductores se crean sin contrasena (no podran iniciar sesion).
 */

const VEHICLES = [
  { code: 'VB-001', plate: 'DMVB01', capacity: 60, status: 'operational' },
  { code: 'VB-002', plate: 'DMVB02', capacity: 60, status: 'operational' },
  { code: 'VB-003', plate: 'DMVB03', capacity: 60, status: 'operational' },
  { code: 'VB-004', plate: 'DMVB04', capacity: 60, status: 'operational' },
  { code: 'VB-005', plate: 'DMVB05', capacity: 45, status: 'operational' },
  { code: 'VB-006', plate: 'DMVB06', capacity: 45, status: 'operational' },
  { code: 'VB-007', plate: 'DMVB07', capacity: 45, status: 'operational' },
  { code: 'VB-008', plate: 'DMVB08', capacity: 45, status: 'operational' },
  { code: 'VB-009', plate: 'DMVB09', capacity: 40, status: 'operational_with_notes' },
  { code: 'VB-010', plate: 'DMVB10', capacity: 40, status: 'operational' },
  { code: 'VB-011', plate: 'DMVB11', capacity: 40, status: 'maintenance' },
  { code: 'VB-012', plate: 'DMVB12', capacity: 40, status: 'out_of_service' },
];

const DRIVERS = [
  { email: 'conductor1.demo@voybus.local', fullName: 'Conductor Demo 1', enabled: 1, vehicle: 'VB-001' },
  { email: 'conductor2.demo@voybus.local', fullName: 'Conductor Demo 2', enabled: 1, vehicle: 'VB-002' },
  { email: 'conductor3.demo@voybus.local', fullName: 'Conductor Demo 3', enabled: 1, vehicle: 'VB-003' },
  { email: 'conductor4.demo@voybus.local', fullName: 'Conductor Demo 4', enabled: 1, vehicle: 'VB-004' },
  { email: 'conductor5.demo@voybus.local', fullName: 'Conductor Demo 5', enabled: 0, vehicle: null },
];

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

async function seedVehicles(db) {
  let created = 0;
  for (const v of VEHICLES) {
    const result = await db.run(
      `INSERT INTO vehicles (code, plate, capacity, status, enabled) VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(code) DO NOTHING`,
      [v.code, v.plate, v.capacity, v.status],
    );
    created += result.changes;
  }
  return created;
}

async function seedDrivers(db, hashPassword, driverPassword) {
  const passwordHash = hashPassword && driverPassword ? await hashPassword(driverPassword) : null;
  let created = 0;
  for (const d of DRIVERS) {
    const result = await db.run(
      `INSERT INTO users (full_name, email, password_hash, role, enabled, verified_at)
       VALUES (?, ?, ?, 'driver', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(email) DO NOTHING`,
      [d.fullName, d.email, passwordHash, d.enabled],
    );
    created += result.changes;
  }
  return created;
}

/** Recorridos habilitados del catalogo, agrupados por linea activa (orden estable por codigo). */
async function loadCatalogRoutes(db) {
  const routes = await db.all(
    `SELECT r.id, r.direction, l.code AS line_code
       FROM routes r JOIN lines l ON l.id = r.line_id
      WHERE r.enabled = 1 AND l.status = 'active'
        AND EXISTS (SELECT 1 FROM route_stops rs WHERE rs.route_id = r.id)
      ORDER BY l.code, CASE r.direction WHEN 'outbound' THEN 0 ELSE 1 END, r.id`,
  );
  const byLine = new Map();
  for (const route of routes) {
    if (!byLine.has(route.line_code)) byLine.set(route.line_code, []);
    byLine.get(route.line_code).push(route);
  }
  return [...byLine.values()];
}

/**
 * Un turno por conductor habilitado que comienza en el bloque de 5 minutos actual
 * y dura 10 h (tolerancia de atraso: 15 min), con 4 viajes alternando los sentidos de su linea.
 * Se omite si el conductor o el vehiculo ya tienen un turno que se superpone.
 */
async function seedShifts(db, now) {
  const lines = await loadCatalogRoutes(db);
  if (!lines.length) {
    throw new Error(
      '[martinSeed] El catálogo no tiene líneas activas con recorridos y paraderos. ' +
        'Ejecuta primero el seed de catálogo de Gianny.',
    );
  }
  const start = new Date(Math.floor(now.getTime() / (5 * MINUTE_MS)) * 5 * MINUTE_MS);
  const end = new Date(start.getTime() + 10 * HOUR_MS);
  let created = 0;

  const drivers = DRIVERS.filter((d) => d.vehicle);
  for (let i = 0; i < drivers.length; i += 1) {
    const driver = await db.get('SELECT id FROM users WHERE email = ?', [drivers[i].email]);
    const vehicle = await db.get('SELECT id FROM vehicles WHERE code = ?', [drivers[i].vehicle]);
    if (!driver || !vehicle) continue;

    const overlap = await db.get(
      `SELECT id FROM shifts
        WHERE status <> 'cancelled' AND (driver_user_id = ? OR vehicle_id = ?)
          AND julianday(planned_start_at) < julianday(?) AND julianday(planned_end_at) > julianday(?)`,
      [driver.id, vehicle.id, end.toISOString(), start.toISOString()],
    );
    if (overlap) continue;

    const routes = lines[i % lines.length];
    await db.transaction(async () => {
      const result = await db.run(
        `INSERT INTO shifts (driver_user_id, vehicle_id, planned_start_at, planned_end_at, status, tolerance_minutes)
         VALUES (?, ?, ?, ?, 'scheduled', 15)`,
        [driver.id, vehicle.id, start.toISOString(), end.toISOString()],
      );
      const shiftId = Number(result.lastInsertRowid);
      for (let n = 0; n < 4; n += 1) {
        const tripStart = new Date(start.getTime() + 5 * MINUTE_MS + n * 2 * HOUR_MS);
        const tripEnd = new Date(tripStart.getTime() + 105 * MINUTE_MS);
        await db.run(
          `INSERT INTO shift_trips (shift_id, route_id, sequence, planned_start_at, planned_end_at)
           VALUES (?, ?, ?, ?, ?)`,
          [shiftId, routes[n % routes.length].id, n + 1, tripStart.toISOString(), tripEnd.toISOString()],
        );
      }
    });
    created += 1;
  }
  return created;
}

async function runMartinSeed({ db, hashPassword, driverPassword, clock } = {}) {
  if (!db) throw new Error('[martinSeed] Falta el adaptador db.');
  const now = clock ? clock.now() : new Date();
  const vehicles = await seedVehicles(db);
  const drivers = await seedDrivers(db, hashPassword, driverPassword);
  const shifts = await seedShifts(db, now);
  const total = await db.get('SELECT COUNT(*) AS n FROM vehicles');
  return { vehiclesCreated: vehicles, driversCreated: drivers, shiftsCreated: shifts, vehiclesTotal: total.n };
}

module.exports = { runMartinSeed, VEHICLES, DRIVERS };
