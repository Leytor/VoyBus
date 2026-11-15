// Conversion entre el formulario (fecha y horas locales) y el contrato (instantes UTC ISO 8601).

const pad = (n) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function localDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localTime(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Fecha local + hora local -> ISO UTC. Si la hora es anterior a `minIso`, se asume el dia siguiente. */
function toIso(date, time, minIso) {
  const value = new Date(`${date}T${time}:00`);
  if (minIso && value.getTime() < Date.parse(minIso)) value.setDate(value.getDate() + 1);
  return value.toISOString();
}

export function emptyTrip(sequence) {
  return { key: `${Date.now()}-${sequence}`, routeId: null, start: '', end: '' };
}

export function formFromShift(shift) {
  return {
    driverUserId: shift.driver.id,
    vehicleId: shift.vehicle.id,
    date: localDate(shift.plannedStartAt),
    start: localTime(shift.plannedStartAt),
    end: localTime(shift.plannedEndAt),
    tolerance: String(shift.toleranceMinutes),
    trips: shift.trips.map((t) => ({
      key: String(t.shiftTripId),
      routeId: t.routeId,
      start: localTime(t.plannedStartAt),
      end: localTime(t.plannedEndAt),
    })),
  };
}

export function emptyForm() {
  return { driverUserId: null, vehicleId: null, date: localDate(), start: '', end: '', tolerance: '10', trips: [emptyTrip(1)] };
}

/** Validacion minima en el cliente; el servidor valida todas las reglas de negocio. */
export function validateForm(form) {
  const errors = {};
  if (!form.driverUserId) errors.driverUserId = 'Selecciona un conductor.';
  if (!form.vehicleId) errors.vehicleId = 'Selecciona un vehículo.';
  if (!DATE_RE.test(form.date)) errors.date = 'Usa el formato AAAA-MM-DD.';
  if (!TIME_RE.test(form.start)) errors.start = 'Usa el formato HH:MM.';
  if (!TIME_RE.test(form.end)) errors.end = 'Usa el formato HH:MM.';
  if (!/^\d{1,3}$/.test(form.tolerance)) errors.tolerance = 'Indica los minutos de tolerancia (número).';
  if (!form.trips.length) errors.trips = 'Agrega al menos un viaje.';
  form.trips.forEach((trip, index) => {
    if (!trip.routeId || !TIME_RE.test(trip.start) || !TIME_RE.test(trip.end)) {
      errors[`trip${index}`] = 'Completa recorrido, hora de inicio y término (HH:MM).';
    }
  });
  return errors;
}

export function payloadFromForm(form) {
  const plannedStartAt = toIso(form.date, form.start);
  const plannedEndAt = toIso(form.date, form.end, new Date(Date.parse(plannedStartAt) + 60000).toISOString());
  return {
    driverUserId: form.driverUserId,
    vehicleId: form.vehicleId,
    plannedStartAt,
    plannedEndAt,
    toleranceMinutes: Number(form.tolerance),
    plannedTrips: form.trips.map((trip, index) => {
      const tripStart = toIso(form.date, trip.start, plannedStartAt);
      return {
        routeId: trip.routeId,
        sequence: index + 1,
        plannedStartAt: tripStart,
        plannedEndAt: toIso(form.date, trip.end, new Date(Date.parse(tripStart) + 60000).toISOString()),
      };
    }),
  };
}
