'use strict';

const { notFound, conflict, unprocessable } = require('../martin-common/http');
const { loadShifts, loadShift, findOverlappingShift } = require('../martin-common/shifts.repository');
const { isIsoUtc, toIso } = require('../martin-common/validate');
const { parseShiftPayload, validateSchedule } = require('./shifts.validation');

const ASSIGNABLE_VEHICLE_STATUS = ['operational', 'operational_with_notes'];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ADM-03: gestion de turnos y asignaciones.
 * Validaciones transaccionales: solapamiento por conductor o vehiculo ([inicio, fin)),
 * conductor habilitado, vehiculo operativo, recorridos habilitados y horario de viajes.
 */
function createShiftsService({ db, clock }) {
  async function listDrivers() {
    const rows = await db.all(
      `SELECT id, full_name, email, enabled FROM users WHERE role = 'driver' ORDER BY full_name`,
    );
    return rows.map((r) => ({ id: r.id, fullName: r.full_name, email: r.email, enabled: r.enabled === 1 }));
  }

  async function listVehicles() {
    const rows = await db.all(
      `SELECT id, code, plate, capacity, status, enabled FROM vehicles ORDER BY code`,
    );
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      plate: r.plate,
      capacity: r.capacity,
      status: r.status,
      enabled: r.enabled === 1,
      assignable: r.enabled === 1 && ASSIGNABLE_VEHICLE_STATUS.includes(r.status),
    }));
  }

  async function listShifts(query = {}) {
    const now = clock.now();
    const from = isIsoUtc(query.from) ? toIso(query.from) : new Date(now.getTime() - DAY_MS).toISOString();
    const to = isIsoUtc(query.to) ? toIso(query.to) : new Date(now.getTime() + 14 * DAY_MS).toISOString();
    const where = ['julianday(s.planned_end_at) >= julianday(?)', 'julianday(s.planned_start_at) <= julianday(?)'];
    const params = [from, to];
    if (query.driverUserId) {
      where.push('s.driver_user_id = ?');
      params.push(Number(query.driverUserId));
    }
    if (query.vehicleId) {
      where.push('s.vehicle_id = ?');
      params.push(Number(query.vehicleId));
    }
    return loadShifts(db, now, `WHERE ${where.join(' AND ')}`, params, 'ORDER BY s.planned_start_at LIMIT 200');
  }

  async function assertDriverAvailable(driverUserId) {
    const driver = await db.get('SELECT id, role, enabled FROM users WHERE id = ?', [driverUserId]);
    if (!driver || driver.role !== 'driver') {
      throw conflict('DRIVER_UNAVAILABLE', 'El usuario indicado no es un conductor.', { reason: 'not_driver' });
    }
    if (driver.enabled !== 1) {
      throw conflict('DRIVER_UNAVAILABLE', 'El conductor está deshabilitado y no puede recibir turnos.', {
        reason: 'disabled',
      });
    }
  }

  async function assertVehicleAvailable(vehicleId) {
    const vehicle = await db.get('SELECT id, status, enabled FROM vehicles WHERE id = ?', [vehicleId]);
    if (!vehicle) {
      throw conflict('VEHICLE_UNAVAILABLE', 'El vehículo no existe.', { reason: 'not_found' });
    }
    if (vehicle.enabled !== 1) {
      throw conflict('VEHICLE_UNAVAILABLE', 'El vehículo está deshabilitado.', { reason: 'disabled' });
    }
    if (!ASSIGNABLE_VEHICLE_STATUS.includes(vehicle.status)) {
      throw conflict('VEHICLE_UNAVAILABLE', 'El vehículo no está operativo (mantenimiento o fuera de servicio).', {
        reason: vehicle.status,
      });
    }
  }

  async function assertRoutesAvailable(plannedTrips) {
    for (const trip of plannedTrips) {
      const route = await db.get(
        `SELECT r.enabled, l.status AS line_status FROM routes r JOIN lines l ON l.id = r.line_id WHERE r.id = ?`,
        [trip.routeId],
      );
      if (!route || route.enabled !== 1 || route.line_status !== 'active') {
        throw unprocessable('INVALID_TRIP_SCHEDULE', `El recorrido del viaje ${trip.sequence} no está disponible.`, {
          reason: 'route_unavailable',
          sequence: trip.sequence,
          routeId: trip.routeId,
        });
      }
    }
  }

  async function assertNoOverlap(shift, excludeShiftId) {
    const overlap = await findOverlappingShift(db, {
      driverUserId: shift.driverUserId,
      vehicleId: shift.vehicleId,
      start: shift.plannedStartAt,
      end: shift.plannedEndAt,
      excludeShiftId,
    });
    if (overlap) {
      const resource = overlap.driver_user_id === shift.driverUserId ? 'driver' : 'vehicle';
      throw conflict(
        'SHIFT_OVERLAP',
        resource === 'driver'
          ? 'El conductor ya tiene un turno que se superpone con ese horario.'
          : 'El vehículo ya tiene un turno que se superpone con ese horario.',
        { resource, conflictingShiftId: overlap.id },
      );
    }
  }

  async function insertPlannedTrips(shiftId, plannedTrips) {
    for (const trip of plannedTrips) {
      await db.run(
        `INSERT INTO shift_trips (shift_id, route_id, sequence, planned_start_at, planned_end_at)
         VALUES (?, ?, ?, ?, ?)`,
        [shiftId, trip.routeId, trip.sequence, trip.plannedStartAt, trip.plannedEndAt],
      );
    }
  }

  async function createShift(body) {
    const shift = validateSchedule(parseShiftPayload(body));
    if (Date.parse(shift.plannedEndAt) <= clock.now().getTime()) {
      throw unprocessable('INVALID_TRIP_SCHEDULE', 'No se puede crear un turno que ya terminó.', {
        reason: 'shift_in_past',
      });
    }
    const shiftId = await db.transaction(async () => {
      await assertDriverAvailable(shift.driverUserId);
      await assertVehicleAvailable(shift.vehicleId);
      await assertRoutesAvailable(shift.plannedTrips);
      await assertNoOverlap(shift, 0);
      const result = await db.run(
        `INSERT INTO shifts (driver_user_id, vehicle_id, planned_start_at, planned_end_at, status, tolerance_minutes)
         VALUES (?, ?, ?, ?, 'scheduled', ?)`,
        [shift.driverUserId, shift.vehicleId, shift.plannedStartAt, shift.plannedEndAt, shift.toleranceMinutes],
      );
      const id = Number(result.lastInsertRowid);
      await insertPlannedTrips(id, shift.plannedTrips);
      return id;
    });
    return loadShift(db, clock.now(), shiftId);
  }

  async function updateShift(shiftId, body) {
    const patch = parseShiftPayload(body, { partial: true });
    if (!Object.keys(patch).length) {
      throw unprocessable('INVALID_TRIP_SCHEDULE', 'No se indicaron cambios.', { reason: 'empty_patch' });
    }

    await db.transaction(async () => {
      const current = await db.get('SELECT * FROM shifts WHERE id = ?', [shiftId]);
      if (!current) throw notFound('SHIFT_NOT_FOUND', 'El turno no existe.');
      if (current.status === 'completed' || current.status === 'cancelled') {
        throw conflict('SHIFT_NOT_EDITABLE', 'No se puede modificar un turno finalizado o cancelado.');
      }

      if (patch.status === 'cancelled') {
        if (current.status !== 'scheduled') {
          throw conflict('SHIFT_IN_PROGRESS', 'Solo se pueden cancelar turnos que aún no inician.');
        }
        await db.run(`UPDATE shifts SET status = 'cancelled' WHERE id = ?`, [shiftId]);
        return;
      }

      const startedTrips = await db.get(
        `SELECT COUNT(*) AS n FROM trips t JOIN shift_trips st ON st.id = t.shift_trip_id WHERE st.shift_id = ?`,
        [shiftId],
      );
      const inProgress = current.status === 'active' || startedTrips.n > 0;
      const structural = ['driverUserId', 'vehicleId', 'plannedStartAt', 'plannedTrips'].filter(
        (key) => patch[key] !== undefined,
      );
      if (inProgress && structural.length) {
        throw conflict(
          'SHIFT_IN_PROGRESS',
          'El turno ya está en curso: solo se puede ajustar la tolerancia o el término planificado.',
          { fields: structural },
        );
      }

      const existingTrips = await db.all(
        `SELECT route_id AS routeId, sequence, planned_start_at AS plannedStartAt, planned_end_at AS plannedEndAt
           FROM shift_trips WHERE shift_id = ? ORDER BY sequence`,
        [shiftId],
      );
      const merged = validateSchedule({
        driverUserId: patch.driverUserId ?? current.driver_user_id,
        vehicleId: patch.vehicleId ?? current.vehicle_id,
        plannedStartAt: patch.plannedStartAt ?? current.planned_start_at,
        plannedEndAt: patch.plannedEndAt ?? current.planned_end_at,
        toleranceMinutes: patch.toleranceMinutes ?? current.tolerance_minutes,
        plannedTrips: patch.plannedTrips ?? existingTrips,
      });

      if (patch.driverUserId !== undefined) await assertDriverAvailable(merged.driverUserId);
      if (patch.vehicleId !== undefined) await assertVehicleAvailable(merged.vehicleId);
      if (patch.plannedTrips !== undefined) await assertRoutesAvailable(merged.plannedTrips);
      await assertNoOverlap(merged, shiftId);

      await db.run(
        `UPDATE shifts SET driver_user_id = ?, vehicle_id = ?, planned_start_at = ?, planned_end_at = ?,
                           tolerance_minutes = ?
          WHERE id = ?`,
        [merged.driverUserId, merged.vehicleId, merged.plannedStartAt, merged.plannedEndAt,
          merged.toleranceMinutes, shiftId],
      );
      if (patch.plannedTrips !== undefined) {
        await db.run('DELETE FROM shift_trips WHERE shift_id = ?', [shiftId]);
        await insertPlannedTrips(shiftId, merged.plannedTrips);
      }
    });
    return loadShift(db, clock.now(), shiftId);
  }

  return { listDrivers, listVehicles, listShifts, createShift, updateShift };
}

module.exports = { createShiftsService };
