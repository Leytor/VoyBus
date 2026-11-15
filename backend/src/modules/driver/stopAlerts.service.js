'use strict';

const { notFound, forbidden, conflict } = require('../martin-common/http');

/**
 * VEH-02: recepcion de alertas de parada.
 *  - Las solicitudes pendientes de un mismo paradero se agrupan con un contador,
 *    sin perder los registros individuales de stop_requests.
 *  - Solo la primera solicitud de un paradero crea un evento sonoro
 *    (UNIQUE trip_id, trip_stop_id, type en driver_alert_events).
 *  - driver_alert_deliveries registra que el conductor ya recibio el aviso,
 *    para no repetirlo al reconectar.
 *  - Los paraderos ya superados no aparecen.
 */
function createStopAlertsService({ db, clock }, driverService) {
  async function getStopAlerts(actor, tripId) {
    return db.transaction(async () => {
      const trip = await driverService.getOwnTrip(actor, tripId);
      if (trip.status !== 'active') throw conflict('TRIP_NOT_ACTIVE', 'El viaje no está en curso.');

      // Asegura el estado `next` aunque la solicitud se haya creado despues de la ultima lectura GPS.
      await driverService.markNextRequests(trip.id, trip.last_passed_sequence);

      const pending = await db.all(
        `SELECT ts.id AS trip_stop_id, ts.sequence, ts.stop_name_snapshot AS stop_name,
                COUNT(sr.id) AS request_count
           FROM stop_requests sr
           JOIN trip_stops ts ON ts.id = sr.trip_stop_id
          WHERE sr.trip_id = ? AND sr.status IN ('sent', 'next') AND ts.sequence > ?
          GROUP BY ts.id, ts.sequence, ts.stop_name_snapshot
          ORDER BY ts.sequence`,
        [trip.id, trip.last_passed_sequence],
      );

      // Un evento por paradero y viaje; si ya existe, el contador sube sin nueva alerta.
      for (const stop of pending) {
        await db.run(
          `INSERT OR IGNORE INTO driver_alert_events (trip_id, trip_stop_id, type, created_at)
           VALUES (?, ?, 'stop_request', ?)`,
          [trip.id, stop.trip_stop_id, clock.now().toISOString()],
        );
      }

      const unseen = await db.all(
        `SELECT e.id AS event_id, e.trip_stop_id, ts.stop_name_snapshot AS stop_name, e.created_at
           FROM driver_alert_events e
           JOIN trip_stops ts ON ts.id = e.trip_stop_id
          WHERE e.trip_id = ? AND ts.sequence > ?
            AND EXISTS (SELECT 1 FROM stop_requests sr
                         WHERE sr.trip_stop_id = e.trip_stop_id AND sr.status IN ('sent', 'next'))
            AND NOT EXISTS (SELECT 1 FROM driver_alert_deliveries d
                             WHERE d.event_id = e.id AND d.driver_user_id = ?)
          ORDER BY ts.sequence`,
        [trip.id, trip.last_passed_sequence, actor.userId],
      );

      return {
        pending: pending.map((p) => ({
          tripStopId: p.trip_stop_id,
          sequence: p.sequence,
          stopName: p.stop_name,
          requestCount: Number(p.request_count),
        })),
        unseenEvents: unseen.map((e) => ({
          eventId: e.event_id,
          tripStopId: e.trip_stop_id,
          stopName: e.stop_name,
          createdAt: e.created_at,
        })),
      };
    });
  }

  /** Registro automatico de recepcion (idempotente); no es una confirmacion manual. */
  async function markEventSeen(actor, eventId) {
    const event = await db.get(
      `SELECT e.id, s.driver_user_id
         FROM driver_alert_events e
         JOIN trips t ON t.id = e.trip_id
         JOIN shift_trips st ON st.id = t.shift_trip_id
         JOIN shifts s ON s.id = st.shift_id
        WHERE e.id = ?`,
      [eventId],
    );
    if (!event) throw notFound('ALERT_EVENT_NOT_FOUND', 'El aviso no existe.');
    if (event.driver_user_id !== actor.userId) {
      throw forbidden('NOT_ASSIGNED_DRIVER', 'Este aviso pertenece a otro conductor.');
    }
    const seenAt = clock.now().toISOString();
    await db.run(
      `INSERT OR IGNORE INTO driver_alert_deliveries (event_id, driver_user_id, seen_at) VALUES (?, ?, ?)`,
      [eventId, actor.userId, seenAt],
    );
    const delivery = await db.get(
      'SELECT seen_at FROM driver_alert_deliveries WHERE event_id = ? AND driver_user_id = ?',
      [eventId, actor.userId],
    );
    return { eventId, seenAt: delivery.seen_at };
  }

  return { getStopAlerts, markEventSeen };
}

module.exports = { createStopAlertsService };
