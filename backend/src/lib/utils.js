const { ApiError } = require('./errors');
const STALE_SECONDS = Number(process.env.GPS_STALE_SECONDS) || 30;
const now = () => new Date().toISOString();
function pagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ApiError(400, 'INVALID_PAGINATION', 'La paginación debe contener enteros positivos (máximo 100).');
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}
function numericId(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new ApiError(400, 'INVALID_ID', 'El identificador no es válido.');
  return n;
}
function locationSummary(db, tripId) {
  const row = db.prepare('SELECT sampled_at FROM trip_locations WHERE trip_id = ? ORDER BY sampled_at DESC, id DESC LIMIT 1').get(tripId);
  const age = row && Date.now() - Date.parse(row.sampled_at);
  return { locationUpdatedAt: row?.sampled_at || null, locationStale: !row || !Number.isFinite(age) || age > STALE_SECONDS * 1000 || age < -60000 };
}
const clean = (value) => typeof value === 'string' ? value.trim() : '';
module.exports = { now, pagination, numericId, locationSummary, clean };
