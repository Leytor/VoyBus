// Formatos de presentacion. Las fechas llegan en UTC (ISO 8601) y se muestran en hora local.

export function formatTime(iso, withSeconds = false) {
  if (!iso) return '—';
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const base = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return withSeconds ? `${base}:${pad(date.getSeconds())}` : base;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

export function formatDateTimeRange(startIso, endIso) {
  return `${formatDate(startIso)} · ${formatTime(startIso)}–${formatTime(endIso)}`;
}

export function secondsSince(iso, now = Date.now()) {
  if (!iso) return null;
  return Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
}

export function formatAgo(iso, now = Date.now()) {
  const seconds = secondsSince(iso, now);
  if (seconds === null) return 'sin datos';
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function directionLabel(direction) {
  if (direction === 'outbound') return 'Ida';
  if (direction === 'inbound') return 'Vuelta';
  return direction || '—';
}

export const SHIFT_STATUS = {
  scheduled: 'Programado',
  active: 'En curso',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
};

export const TRIP_STATUS = {
  planned: 'Planificado',
  active: 'En curso',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
};

export const VEHICLE_STATUS = {
  operational: 'Operativo',
  operational_with_notes: 'Operativo con observaciones',
  maintenance: 'En mantenimiento',
  out_of_service: 'Fuera de servicio',
};

export function punctualityLabel(punctuality) {
  if (!punctuality) return null;
  switch (punctuality.status) {
    case 'on_time':
      return { text: 'Inicio a tiempo', tone: 'success' };
    case 'late':
      return { text: `Inicio con atraso (${punctuality.delayMinutes} min)`, tone: 'danger' };
    case 'not_started_late':
      return { text: `No iniciado · atraso ${punctuality.delayMinutes} min`, tone: 'danger' };
    default:
      return { text: 'Pendiente de inicio', tone: 'neutral' };
  }
}

export function coordinates(latitude, longitude) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return '—';
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
