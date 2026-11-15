'use strict';

const { notFound, forbidden, conflict, unprocessable } = require('../martin-common/http');
const { loadShifts, loadShift } = require('../martin-common/shifts.repository');
const { isIsoUtc, isFiniteNumber, toIso } = require('../martin-common/validate');
const { evaluateProgress, haversineMeters } = require('./tripProgress');

const ASSIGNABLE_VEHICLE_STATUS = ['operational', 'operational_with_notes'];
const HOUR_MS = 60 * 60 * 1000;

/**
 * VEH-01: gestion del viaje y ubicacion GPS del conductor.
 * Toda escritura que cambia varias tablas se ejecuta en una transaccion.
 */
function createDriverService({ db, clock, config }) {
  const nowIso = () => clock.now().toISOString();

  // ---------------------------------------------------------------- turnos

  /** Turnos vigentes del conductor: activos, futuros y los terminados en las ultimas 12 h. */
  async function listMyShifts(actor) {
    const now = clock.now();
    const since = new Date(now.getTime() - 12 * HOUR_MS).toISOString();
    return loadShifts(
      db,
      now,
      `WHERE s.driver_user_id = ?
         AND (s.status = 'active'
              OR (s.status = 'scheduled' AND julianday(s.planned_end_at) >= julianday(?))
              OR (s.status = 'completed' AND julianday(s.actual_end_at) >= julianday(?)))`,
      [actor.userId, since, since],
      'ORDER BY s.planned_start_at LIMIT 50',
    );
  }

  async function getOwnShift(actor, shiftId) {
    const shift = await db.get('SELECT * FROM shifts WHERE id = ?', [shiftId]);
    if (!shift) throw notFound('SHIFT_NOT_FOUND', 'El turno no existe.');
    if (shift.driver_user_id !== actor.userId) {
      throw forbidden('NOT_ASSIGNED_DRIVER', 'Este turno está asignado a otro conductor.');
    }
    return shift;
  }

  async function startShift(actor, shiftId) {
    await db.transaction(async () => {
      const shift = await getOwnShift(actor, shiftId);
      if (shift.status === 'active') throw conflict('SHIFT_ALREADY_ACTIVE', 'El turno ya está iniciado.');
      if (shift.status !== 'scheduled') {
        throw conflict('SHIFT_NOT_STARTABLE', 'El turno ya fue finalizado o cancelado.');
      }
      const driver = await db.get('SELECT enabled FROM users WHERE id = ?', [actor.userId]);
      if (!driver || driver.enabled !== 1) {
        throw forbidden('DRIVER_UNAVAILABLE', 'Tu cuenta de conductor está deshabilitada.');
      }
      const now = clock.now().getTime();
      if (now >= Date.parse(shift.planned_end_at)) {
        throw conflict('SHIFT_EXPIRED', 'El horario de este turno ya terminó.');
      }
      if (now < Date.parse(shift.planned_start_at) - config.shiftEarlyStartMinutes * 60 * 1000) {
        throw conflict('SHIFT_NOT_YET_AVAILABLE', 'Todavía es muy temprano para iniciar este turno.');
      }
      const otherActive = await db.get(
        `SELECT id FROM shifts WHERE driver_user_id = ? AND status = 'active' AND id <> ?`,
        [actor.userId, shiftId],
      );
      if (otherActive) {
        throw conflict('ACTIVE_SHIFT_EXISTS', 'Ya tienes otro turno en curso.', { shiftId: otherActive.id });
      }
      await db.run(
        `UPDATE shifts SET status = 'active', actual_start_at = ? WHERE id = ? AND status = 'scheduled'`,
        [nowIso(), shiftId],
      );
    });
    return loadShift(db, clock.now(), shiftId);
  }

  async function finishShift(actor, shiftId) {
    await db.transaction(async () => {
      const shift = await getOwnShift(actor, shiftId);
      if (shift.status !== 'active') throw conflict('SHIFT_NOT_ACTIVE', 'El turno no está en curso.');
      const activeTrip = await db.get(
        `SELECT t.id FROM trips t JOIN shift_trips st ON st.id = t.shift_trip_id
          WHERE st.shift_id = ? AND t.status = 'active'`,
        [shiftId],
      );
      if (activeTrip) {
        throw conflict('ACTIVE_TRIP_IN_SHIFT', 'Finaliza el viaje en curso antes de cerrar el turno.', {
          tripId: activeTrip.id,
        });
      }
      await db.run(
        `UPDATE shifts SET status = 'completed', actual_end_at = ? WHERE id = ? AND status = 'active'`,
        [nowIso(), shiftId],
      );
    });
    return loadShift(db, clock.now(), shiftId);
  }

  // ----------------------------------------------------------------- viajes

  async function startTrip(actor, shiftTripId) {
    return db.transaction(async () => {
      const row = await db.get(
        `SELECT st.id AS shift_trip_id, st.route_id, s.id AS shift_id, s.status AS shift_status,
                s.driver_user_id, v.id AS vehicle_id, v.code AS vehicle_code, v.status AS vehicle_status,
                v.enabled AS vehicle_enabled, r.enabled AS route_enabled, l.status AS line_status
           FROM shift_trips st
           JOIN shifts s ON s.id = st.shift_id
           JOIN vehicles v ON v.id = s.vehicle_id
           JOIN routes r ON r.id = st.route_id
           JOIN lines l ON l.id = r.line_id
          WHERE st.id = ?`,
        [shiftTripId],
      );
      if (!row) throw notFound('SHIFT_TRIP_NOT_FOUND', 'El viaje planificado no existe.');
      if (row.driver_user_id !== actor.userId) {
        throw forbidden('NOT_ASSIGNED_DRIVER', 'Este viaje está asignado a otro conductor.');
      }
      if (row.shift_status !== 'active') {
        throw conflict('SHIFT_NOT_ACTIVE', 'Debes iniciar el turno antes de comenzar un viaje.');
      }

      const existing = await db.get('SELECT id, status FROM trips WHERE shift_trip_id = ?', [shiftTripId]);
      if (existing && existing.status === 'active') {
        throw conflict('TRIP_ALREADY_ACTIVE', 'Este viaje ya está en curso.', { tripId: existing.id });
      }
      if (existing && existing.status !== 'planned') {
        throw conflict('TRIP_ALREADY_FINISHED', 'Este viaje ya fue realizado.', { tripId: existing.id });
      }

      const driverTrip = await db.get(
        `SELECT t.id FROM trips t
           JOIN shift_trips st ON st.id = t.shift_trip_id
           JOIN shifts s ON s.id = st.shift_id
          WHERE s.driver_user_id = ? AND t.status = 'active'`,
        [actor.userId],
      );
      if (driverTrip) {
        throw conflict('ACTIVE_TRIP_EXISTS', 'Ya tienes un viaje en curso. Finalízalo antes de iniciar otro.', {
          tripId: driverTrip.id,
        });
      }
      const vehicleTrip = await db.get(
        `SELECT t.id FROM trips t
           JOIN shift_trips st ON st.id = t.shift_trip_id
           JOIN shifts s ON s.id = st.shift_id
          WHERE s.vehicle_id = ? AND t.status = 'active'`,
        [row.vehicle_id],
      );
      if (vehicleTrip) {
        throw conflict('VEHICLE_IN_USE', 'El vehículo ya está realizando otro viaje.', { tripId: vehicleTrip.id });
      }
      if (row.vehicle_enabled !== 1 || !ASSIGNABLE_VEHICLE_STATUS.includes(row.vehicle_status)) {
        throw conflict('VEHICLE_UNAVAILABLE', 'El vehículo no está operativo para iniciar viajes.', {
          vehicleStatus: row.vehicle_status,
        });
      }
      if (row.route_enabled !== 1 || row.line_status !== 'active') {
        throw conflict('ROUTE_UNAVAILABLE', 'El recorrido o la línea no están disponibles.', {
          lineStatus: row.line_status,
        });
      }

      const routeStops = await db.all(
        `SELECT rs.sequence, s.id AS stop_id, s.code, s.name, s.latitude, s.longitude
           FROM route_stops rs JOIN stops s ON s.id = rs.stop_id
          WHERE rs.route_id = ?
          ORDER BY rs.sequence`,
        [row.route_id],
      );
      if (!routeStops.length) {
        throw unprocessable('ROUTE_WITHOUT_STOPS', 'El recorrido no tiene paraderos configurados.');
      }

      const startedAt = nowIso();
      let tripId;
      if (existing) {
        tripId = existing.id;
        await db.run(
          `UPDATE trips SET status = 'active', started_at = ?, last_passed_sequence = 0 WHERE id = ?`,
          [startedAt, tripId],
        );
        await db.run('DELETE FROM trip_stops WHERE trip_id = ?', [tripId]);
      } else {
        const result = await db.run(
          `INSERT INTO trips (shift_trip_id, status, started_at, last_passed_sequence) VALUES (?, 'active', ?, 0)`,
          [shiftTripId, startedAt],
        );
        tripId = Number(result.lastInsertRowid);
      }

      // Instantanea del recorrido: cambios posteriores en route_stops no afectan este viaje.
      for (const stop of routeStops) {
        await db.run(
          `INSERT INTO trip_stops (trip_id, sequence, stop_id, stop_code_snapshot, stop_name_snapshot,
                                   latitude_snapshot, longitude_snapshot)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tripId, stop.sequence, stop.stop_id, stop.code, stop.name, stop.latitude, stop.longitude],
        );
      }

      return { tripId, status: 'active', vehicleCode: row.vehicle_code, routeId: row.route_id, startedAt };
    });
  }

  /** Viaje del conductor autenticado; 404/403 si no corresponde. */
  async function getOwnTrip(actor, tripId) {
    const trip = await db.get(
      `SELECT t.*, st.route_id, s.driver_user_id, s.id AS shift_id
         FROM trips t
         JOIN shift_trips st ON st.id = t.shift_trip_id
         JOIN shifts s ON s.id = st.shift_id
        WHERE t.id = ?`,
      [tripId],
    );
    if (!trip) throw notFound('TRIP_NOT_FOUND', 'El viaje no existe.');
    if (trip.driver_user_id !== actor.userId) {
      throw forbidden('NOT_ASSIGNED_DRIVER', 'Este viaje pertenece a otro conductor.');
    }
    return trip;
  }

  function validateLocationBody(body) {
    const errors = {};
    if (!isFiniteNumber(body.latitude) || body.latitude < -90 || body.latitude > 90) {
      errors.latitude = 'Debe ser un número entre -90 y 90.';
    }
    if (!isFiniteNumber(body.longitude) || body.longitude < -180 || body.longitude > 180) {
      errors.longitude = 'Debe ser un número entre -180 y 180.';
    }
    if (body.accuracyMeters !== undefined && body.accuracyMeters !== null &&
        (!isFiniteNumber(body.accuracyMeters) || body.accuracyMeters < 0)) {
      errors.accuracyMeters = 'Debe ser un número mayor o igual a 0.';
    }
    if (!isIsoUtc(body.sampledAt)) errors.sampledAt = 'Debe ser una fecha UTC ISO 8601.';
    if (Object.keys(errors).length) {
      throw unprocessable('INVALID_LOCATION', 'La lectura GPS no es válida.', errors);
    }
  }

  /**
   * Registra una lectura GPS y actualiza el avance de forma monotona.
   * El cliente nunca decide last_passed_sequence.
   */
  async function recordLocation(actor, tripId, body = {}) {
    validateLocationBody(body);
    const gps = config.gps;
    const sampledAt = toIso(body.sampledAt);
    const accuracy = body.accuracyMeters ?? null;
    const now = clock.now().getTime();
    const sampleTime = Date.parse(sampledAt);

    if (sampleTime - now > gps.maxFutureSkewSeconds * 1000) {
      throw unprocessable('SAMPLE_IN_FUTURE', 'La hora de la lectura GPS está adelantada; revisa el reloj del teléfono.');
    }
    if (now - sampleTime > gps.maxSampleAgeSeconds * 1000) {
      throw unprocessable('SAMPLE_TOO_OLD', 'La lectura GPS es demasiado antigua.');
    }
    if (accuracy !== null && accuracy > gps.maxAccuracyMeters) {
      throw unprocessable('LOW_ACCURACY', 'La precisión del GPS es insuficiente.', {
        accuracyMeters: accuracy,
        maxAccuracyMeters: gps.maxAccuracyMeters,
      });
    }

    return db.transaction(async () => {
      const trip = await getOwnTrip(actor, tripId);
      if (trip.status !== 'active') throw conflict('TRIP_NOT_ACTIVE', 'El viaje no está en curso.');

      const previous = await db.get(
        `SELECT latitude, longitude, sampled_at FROM trip_locations
          WHERE trip_id = ? ORDER BY sampled_at DESC, id DESC LIMIT 1`,
        [tripId],
      );
      if (previous) {
        const prevTime = Date.parse(previous.sampled_at);
        if (sampleTime === prevTime) {
          // Reintento de la misma lectura: idempotente, no se duplica.
          return { tripId, receivedAt: nowIso(), lastPassedSequence: trip.last_passed_sequence, locationStale: false };
        }
        if (sampleTime < prevTime) {
          throw conflict('OUT_OF_ORDER_SAMPLE', 'Llegó una lectura GPS más antigua que la última registrada.');
        }
        const seconds = (sampleTime - prevTime) / 1000;
        const meters = haversineMeters(previous, body);
        if (meters / seconds > gps.maxSpeedMetersPerSecond) {
          throw unprocessable('IMPLAUSIBLE_JUMP', 'La lectura GPS implica un salto imposible y se descartó.');
        }
      }

      const receivedAt = nowIso();
      await db.run(
        `INSERT INTO trip_locations (trip_id, latitude, longitude, accuracy_meters, sampled_at, received_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tripId, body.latitude, body.longitude, accuracy, sampledAt, receivedAt],
      );

      const lastPassed = await updateProgress(trip);
      return { tripId, receivedAt, lastPassedSequence: lastPassed, locationStale: false };
    });
  }

  /** Calcula el avance con las ultimas lecturas y actualiza solicitudes (sent -> next -> closed). */
  async function updateProgress(trip) {
    const tripStops = await db.all(
      `SELECT sequence, latitude_snapshot AS latitude, longitude_snapshot AS longitude
         FROM trip_stops WHERE trip_id = ? ORDER BY sequence`,
      [trip.id],
    );
    const route = await db.get('SELECT geometry_json FROM routes WHERE id = ?', [trip.route_id]);
    const recentSamples = await db.all(
      `SELECT latitude, longitude, sampled_at AS sampledAt FROM trip_locations
        WHERE trip_id = ? ORDER BY sampled_at DESC, id DESC LIMIT ?`,
      [trip.id, config.gps.confirmSamples],
    );

    const result = evaluateProgress({
      geometryJson: route ? route.geometry_json : '[]',
      tripStops,
      lastPassedSequence: trip.last_passed_sequence,
      recentSamples,
      gps: config.gps,
    });

    let lastPassed = trip.last_passed_sequence;
    if (result.lastPassedSequence > lastPassed) {
      // Guardia monotona: nunca se reescribe con un valor menor.
      await db.run(
        `UPDATE trips SET last_passed_sequence = ? WHERE id = ? AND last_passed_sequence < ?`,
        [result.lastPassedSequence, trip.id, result.lastPassedSequence],
      );
      lastPassed = result.lastPassedSequence;
      await db.run(
        `UPDATE stop_requests
            SET status = 'closed', closure_reason = 'stop_passed', closed_at = ?
          WHERE trip_id = ? AND status IN ('sent', 'next')
            AND trip_stop_id IN (SELECT id FROM trip_stops WHERE trip_id = ? AND sequence <= ?)`,
        [nowIso(), trip.id, trip.id, lastPassed],
      );
    }
    await markNextRequests(trip.id, lastPassed);
    return lastPassed;
  }

  /** Las solicitudes cuyo destino es el siguiente paradero futuro pasan a `next`. */
  async function markNextRequests(tripId, lastPassed) {
    await db.run(
      `UPDATE stop_requests SET status = 'next'
        WHERE trip_id = ? AND status = 'sent'
          AND trip_stop_id IN (
              SELECT id FROM trip_stops
               WHERE trip_id = ?
                 AND sequence = (SELECT MIN(sequence) FROM trip_stops WHERE trip_id = ? AND sequence > ?))`,
      [tripId, tripId, tripId, lastPassed],
    );
  }

  /**
   * Finaliza el viaje: cierra solicitudes pendientes (trip_finished), libera
   * vinculos y deja de mostrar el vehiculo. No cierra el turno.
   */
  async function finishTrip(actor, tripId) {
    return db.transaction(async () => {
      const trip = await getOwnTrip(actor, tripId);
      if (trip.status !== 'active') throw conflict('TRIP_NOT_ACTIVE', 'El viaje no está en curso.');
      const finishedAt = nowIso();
      await db.run(`UPDATE trips SET status = 'finished', finished_at = ? WHERE id = ?`, [finishedAt, tripId]);
      const closed = await db.run(
        `UPDATE stop_requests SET status = 'closed', closure_reason = 'trip_finished', closed_at = ?
          WHERE trip_id = ? AND status IN ('sent', 'next')`,
        [finishedAt, tripId],
      );
      const ended = await db.run(
        `UPDATE trip_links SET ended_at = ? WHERE trip_id = ? AND ended_at IS NULL`,
        [finishedAt, tripId],
      );
      return {
        tripId,
        status: 'finished',
        finishedAt,
        closedRequests: Number(closed.changes || 0),
        endedLinks: Number(ended.changes || 0),
      };
    });
  }

  return {
    listMyShifts,
    startShift,
    finishShift,
    startTrip,
    getOwnTrip,
    recordLocation,
    finishTrip,
    markNextRequests,
  };
}

module.exports = { createDriverService };
