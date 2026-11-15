'use strict';

/**
 * Consultas y formato JSON de turnos, compartidos por el modulo del conductor
 * (VEH-01) y el de administracion (ADM-03).
 */

const MINUTE_MS = 60 * 1000;

/**
 * Puntualidad del turno segun el margen de tolerancia definido por el
 * administrador (ADM-03). No modifica las horas originales.
 *  - pending:          aun no inicia y esta dentro de la tolerancia
 *  - not_started_late: no ha iniciado y ya se supero la tolerancia
 *  - on_time / late:   inicio real dentro / fuera de la tolerancia
 */
function computePunctuality(shift, now) {
  const plannedStart = Date.parse(shift.planned_start_at);
  const plannedEnd = Date.parse(shift.planned_end_at);
  const toleranceMs = shift.tolerance_minutes * MINUTE_MS;
  let status;
  let delayMinutes = 0;

  if (shift.actual_start_at) {
    delayMinutes = Math.max(0, Math.round((Date.parse(shift.actual_start_at) - plannedStart) / MINUTE_MS));
    status = Date.parse(shift.actual_start_at) - plannedStart > toleranceMs ? 'late' : 'on_time';
  } else if (shift.status === 'scheduled' && now.getTime() > plannedStart + toleranceMs) {
    delayMinutes = Math.round((now.getTime() - plannedStart) / MINUTE_MS);
    status = 'not_started_late';
  } else {
    status = 'pending';
  }

  const earlyFinish = Boolean(
    shift.actual_end_at && plannedEnd - Date.parse(shift.actual_end_at) > toleranceMs,
  );
  return { status, delayMinutes, earlyFinish };
}

function mapTrip(row) {
  return {
    shiftTripId: row.shift_trip_id,
    sequence: row.sequence,
    plannedStartAt: row.planned_start_at,
    plannedEndAt: row.planned_end_at,
    routeId: row.route_id,
    direction: row.direction,
    startLabel: row.start_label,
    endLabel: row.end_label,
    line: { id: row.line_id, code: row.line_code, name: row.line_name, colorHex: row.color_hex },
    trip: row.trip_id
      ? {
          tripId: row.trip_id,
          status: row.trip_status,
          startedAt: row.started_at,
          finishedAt: row.finished_at,
          lastPassedSequence: row.last_passed_sequence,
        }
      : null,
  };
}

function mapShift(shift, trips, now) {
  return {
    id: shift.id,
    status: shift.status,
    plannedStartAt: shift.planned_start_at,
    plannedEndAt: shift.planned_end_at,
    actualStartAt: shift.actual_start_at,
    actualEndAt: shift.actual_end_at,
    toleranceMinutes: shift.tolerance_minutes,
    punctuality: computePunctuality(shift, now),
    driver: { id: shift.driver_user_id, fullName: shift.driver_name, enabled: shift.driver_enabled === 1 },
    vehicle: {
      id: shift.vehicle_id,
      code: shift.vehicle_code,
      plate: shift.vehicle_plate,
      status: shift.vehicle_status,
    },
    trips: trips.map(mapTrip),
  };
}

const SHIFT_SELECT = `
  SELECT s.*, u.full_name AS driver_name, u.enabled AS driver_enabled,
         v.code AS vehicle_code, v.plate AS vehicle_plate, v.status AS vehicle_status
  FROM shifts s
  JOIN users u ON u.id = s.driver_user_id
  JOIN vehicles v ON v.id = s.vehicle_id`;

const TRIPS_SELECT = `
  SELECT st.id AS shift_trip_id, st.shift_id, st.sequence, st.route_id,
         st.planned_start_at, st.planned_end_at,
         r.direction, r.start_label, r.end_label, r.line_id,
         l.code AS line_code, l.name AS line_name, l.color_hex,
         t.id AS trip_id, t.status AS trip_status, t.started_at, t.finished_at, t.last_passed_sequence
  FROM shift_trips st
  JOIN routes r ON r.id = st.route_id
  JOIN lines l ON l.id = r.line_id
  LEFT JOIN trips t ON t.shift_trip_id = st.id`;

/** Carga turnos (con filtro SQL opcional) y sus viajes planificados. */
async function loadShifts(db, now, whereSql = '', params = [], tail = 'ORDER BY s.planned_start_at') {
  const shifts = await db.all(`${SHIFT_SELECT} ${whereSql} ${tail}`, params);
  if (!shifts.length) return [];
  const ids = shifts.map((s) => s.id);
  const placeholders = ids.map(() => '?').join(',');
  const trips = await db.all(
    `${TRIPS_SELECT} WHERE st.shift_id IN (${placeholders}) ORDER BY st.shift_id, st.sequence`,
    ids,
  );
  return shifts.map((shift) =>
    mapShift(shift, trips.filter((t) => t.shift_id === shift.id), now),
  );
}

async function loadShift(db, now, shiftId) {
  const [shift] = await loadShifts(db, now, 'WHERE s.id = ?', [shiftId]);
  return shift || null;
}

/**
 * Busca un turno no cancelado que se superponga con [start, end) para el
 * conductor o el vehiculo indicados (fin exclusivo: turnos contiguos son validos).
 */
async function findOverlappingShift(db, { driverUserId, vehicleId, start, end, excludeShiftId = 0 }) {
  return db.get(
    `SELECT id, driver_user_id, vehicle_id, planned_start_at, planned_end_at
       FROM shifts
      WHERE status <> 'cancelled'
        AND id <> ?
        AND (driver_user_id = ? OR vehicle_id = ?)
        AND julianday(planned_start_at) < julianday(?)
        AND julianday(planned_end_at) > julianday(?)
      ORDER BY planned_start_at
      LIMIT 1`,
    [excludeShiftId, driverUserId, vehicleId, end, start],
  );
}

module.exports = { computePunctuality, loadShifts, loadShift, findOverlappingShift };
