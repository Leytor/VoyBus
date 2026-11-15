'use strict';

const express = require('express');
const { asyncHandler, sendData, martinErrorHandler } = require('../martin-common/http');
const { parseId } = require('../martin-common/validate');
const { createDriverService } = require('./driver.service');
const { createStopAlertsService } = require('./stopAlerts.service');

/**
 * Endpoints del conductor (VEH-01 y VEH-02). Montar bajo /api/v1.
 * El middleware de rol se aplica por ruta (no con router.use) para no
 * interferir con las rutas de Gianny montadas en el mismo prefijo.
 */
function createDriverRouter(deps) {
  const driver = createDriverService(deps);
  const alerts = createStopAlertsService(deps, driver);
  const onlyDriver = deps.auth.requireRole('driver');
  const json = express.json({ limit: '20kb' });
  const actorOf = (req) => deps.auth.getActor(req);
  const router = express.Router();

  router.get(
    '/driver/shifts',
    onlyDriver,
    asyncHandler(async (req, res) => sendData(res, await driver.listMyShifts(actorOf(req)))),
  );

  router.post(
    '/driver/shifts/:shiftId/start',
    onlyDriver,
    asyncHandler(async (req, res) => {
      sendData(res, await driver.startShift(actorOf(req), parseId(req.params.shiftId, 'shiftId')));
    }),
  );

  router.post(
    '/driver/shifts/:shiftId/finish',
    onlyDriver,
    asyncHandler(async (req, res) => {
      sendData(res, await driver.finishShift(actorOf(req), parseId(req.params.shiftId, 'shiftId')));
    }),
  );

  router.post(
    '/driver/shift-trips/:shiftTripId/start',
    onlyDriver,
    asyncHandler(async (req, res) => {
      const trip = await driver.startTrip(actorOf(req), parseId(req.params.shiftTripId, 'shiftTripId'));
      sendData(res, trip, 201);
    }),
  );

  router.post(
    '/driver/trips/:tripId/locations',
    onlyDriver,
    json,
    asyncHandler(async (req, res) => {
      const result = await driver.recordLocation(actorOf(req), parseId(req.params.tripId, 'tripId'), req.body || {});
      sendData(res, result, 201);
    }),
  );

  router.post(
    '/driver/trips/:tripId/finish',
    onlyDriver,
    asyncHandler(async (req, res) => {
      sendData(res, await driver.finishTrip(actorOf(req), parseId(req.params.tripId, 'tripId')));
    }),
  );

  router.get(
    '/driver/trips/:tripId/stop-alerts',
    onlyDriver,
    asyncHandler(async (req, res) => {
      sendData(res, await alerts.getStopAlerts(actorOf(req), parseId(req.params.tripId, 'tripId')));
    }),
  );

  router.post(
    '/driver/alert-events/:eventId/seen',
    onlyDriver,
    asyncHandler(async (req, res) => {
      sendData(res, await alerts.markEventSeen(actorOf(req), parseId(req.params.eventId, 'eventId')));
    }),
  );

  router.use(martinErrorHandler);
  return router;
}

module.exports = { createDriverRouter };
