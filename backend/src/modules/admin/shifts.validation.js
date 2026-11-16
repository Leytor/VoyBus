'use strict';

const { badRequest, unprocessable } = require('../martin-common/http');
const { isIsoUtc, isPositiveInt, toIso } = require('../martin-common/validate');

const MAX_SHIFT_HOURS = 16;
const MAX_TOLERANCE_MINUTES = 120;
const MAX_PLANNED_TRIPS = 30;

const invalidSchedule = (reason, message, extra = {}) =>
  unprocessable('INVALID_TRIP_SCHEDULE', message, { reason, ...extra });

/** Validacion de formato (400). Devuelve una copia normalizada. */
function parseShiftPayload(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('VALIDATION_ERROR', 'El cuerpo de la petición debe ser un objeto JSON.');
  }
  const errors = {};
  const out = {};
  const has = (key) => body[key] !== undefined;

  for (const key of ['driverUserId', 'vehicleId']) {
    if (has(key)) {
      if (!isPositiveInt(body[key])) errors[key] = 'Debe ser un identificador numérico.';
      else out[key] = body[key];
    } else if (!partial) errors[key] = 'Campo obligatorio.';
  }

  for (const key of ['plannedStartAt', 'plannedEndAt']) {
    if (has(key)) {
      if (!isIsoUtc(body[key])) errors[key] = 'Debe ser una fecha UTC ISO 8601.';
      else out[key] = toIso(body[key]);
    } else if (!partial) errors[key] = 'Campo obligatorio.';
  }

  if (has('toleranceMinutes')) {
    if (!Number.isSafeInteger(body.toleranceMinutes) || body.toleranceMinutes < 0 ||
        body.toleranceMinutes > MAX_TOLERANCE_MINUTES) {
      errors.toleranceMinutes = `Debe ser un entero entre 0 y ${MAX_TOLERANCE_MINUTES}.`;
    } else out.toleranceMinutes = body.toleranceMinutes;
  } else if (!partial) out.toleranceMinutes = 0;

  if (has('plannedTrips')) {
    if (!Array.isArray(body.plannedTrips) || body.plannedTrips.length === 0) {
      errors.plannedTrips = 'Debe incluir al menos un viaje planificado.';
    } else if (body.plannedTrips.length > MAX_PLANNED_TRIPS) {
      errors.plannedTrips = `No puede superar ${MAX_PLANNED_TRIPS} viajes.`;
    } else {
      out.plannedTrips = body.plannedTrips.map((trip, index) => {
        const tripErrors = [];
        if (!trip || typeof trip !== 'object') tripErrors.push('debe ser un objeto');
        else {
          if (!isPositiveInt(trip.routeId)) tripErrors.push('routeId inválido');
          if (!isPositiveInt(trip.sequence)) tripErrors.push('sequence debe ser un entero >= 1');
          if (!isIsoUtc(trip.plannedStartAt)) tripErrors.push('plannedStartAt inválido');
          if (!isIsoUtc(trip.plannedEndAt)) tripErrors.push('plannedEndAt inválido');
        }
        if (tripErrors.length) {
          errors[`plannedTrips[${index}]`] = tripErrors.join(', ');
          return null;
        }
        return {
          routeId: trip.routeId,
          sequence: trip.sequence,
          plannedStartAt: toIso(trip.plannedStartAt),
          plannedEndAt: toIso(trip.plannedEndAt),
        };
      });
    }
  } else if (!partial) errors.plannedTrips = 'Campo obligatorio.';

  if (has('status')) {
    if (body.status !== 'cancelled') errors.status = 'Solo se permite cambiar el estado a "cancelled".';
    else out.status = 'cancelled';
  }

  if (Object.keys(errors).length) {
    throw badRequest('VALIDATION_ERROR', 'Hay campos con formato inválido.', errors);
  }
  return out;
}

/** Reglas de horario (422 INVALID_TRIP_SCHEDULE). */
function validateSchedule(shift) {
  const start = Date.parse(shift.plannedStartAt);
  const end = Date.parse(shift.plannedEndAt);
  if (end <= start) {
    throw invalidSchedule('shift_end_before_start', 'El término del turno debe ser posterior a su inicio.');
  }
  if (end - start > MAX_SHIFT_HOURS * 60 * 60 * 1000) {
    throw invalidSchedule('shift_too_long', `Un turno no puede durar más de ${MAX_SHIFT_HOURS} horas.`);
  }

  const trips = shift.plannedTrips.slice().sort((a, b) => a.sequence - b.sequence);
  const sequences = new Set();
  let previousEnd = null;
  for (const trip of trips) {
    if (sequences.has(trip.sequence)) {
      throw invalidSchedule('duplicated_sequence', `El orden ${trip.sequence} está repetido.`, {
        sequence: trip.sequence,
      });
    }
    sequences.add(trip.sequence);
    const tripStart = Date.parse(trip.plannedStartAt);
    const tripEnd = Date.parse(trip.plannedEndAt);
    if (tripEnd <= tripStart) {
      throw invalidSchedule('trip_end_before_start', `El viaje ${trip.sequence} termina antes de comenzar.`, {
        sequence: trip.sequence,
      });
    }
    if (tripStart < start || tripEnd > end) {
      throw invalidSchedule('trip_outside_shift', `El viaje ${trip.sequence} queda fuera del horario del turno.`, {
        sequence: trip.sequence,
      });
    }
    if (previousEnd !== null && tripStart < previousEnd) {
      throw invalidSchedule(
        'trips_overlap_or_out_of_order',
        `El viaje ${trip.sequence} comienza antes de que termine el viaje anterior.`,
        { sequence: trip.sequence },
      );
    }
    previousEnd = tripEnd;
  }
  return { ...shift, plannedTrips: trips };
}

module.exports = { parseShiftPayload, validateSchedule };
