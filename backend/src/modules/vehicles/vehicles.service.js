'use strict';

/**
 * Visualizacion de vehiculos (segundo "RED-02" de la ERS).
 * Solo viajes en estado `active` que ya informaron una posicion; los viajes
 * finalizados dejan de aparecer. Si no llega una lectura valida en
 * `staleAfterSeconds`, se conserva la ultima posicion con locationStale = true.
 */
function createVehiclesService({ db, clock, config }) {
  async function listActiveVehicles({ lineId = null } = {}) {
    const rows = await db.all(
      `SELECT v.code AS vehicle_code, t.id AS trip_id, r.line_id, st.route_id, r.direction,
              loc.latitude, loc.longitude, loc.sampled_at
         FROM trips t
         JOIN shift_trips st ON st.id = t.shift_trip_id
         JOIN shifts s ON s.id = st.shift_id
         JOIN vehicles v ON v.id = s.vehicle_id
         JOIN routes r ON r.id = st.route_id
         JOIN trip_locations loc ON loc.id = (
              SELECT id FROM trip_locations
               WHERE trip_id = t.id
               ORDER BY sampled_at DESC, id DESC
               LIMIT 1)
        WHERE t.status = 'active'
          AND (? IS NULL OR r.line_id = ?)
        ORDER BY v.code`,
      [lineId, lineId],
    );

    const now = clock.now().getTime();
    const staleMs = config.staleAfterSeconds * 1000;
    return rows.map((row) => ({
      vehicleCode: row.vehicle_code,
      tripId: row.trip_id,
      lineId: row.line_id,
      routeId: row.route_id,
      direction: row.direction,
      latitude: row.latitude,
      longitude: row.longitude,
      locationUpdatedAt: row.sampled_at,
      locationStale: now - Date.parse(row.sampled_at) > staleMs,
    }));
  }

  return { listActiveVehicles };
}

module.exports = { createVehiclesService };
