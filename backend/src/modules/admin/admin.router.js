'use strict';

const express = require('express');
const { asyncHandler, sendData, martinErrorHandler } = require('../martin-common/http');
const { parseId, parseOptionalId } = require('../martin-common/validate');
const { createShiftsService } = require('./shifts.service');

/** Endpoints de administracion de turnos (ADM-03). Montar bajo /api/v1. */
function createAdminRouter(deps) {
  const shifts = createShiftsService(deps);
  const onlyAdmin = deps.auth.requireRole('admin');
  const json = express.json({ limit: '50kb' });
  const router = express.Router();

  router.get(
    '/admin/drivers',
    onlyAdmin,
    asyncHandler(async (req, res) => sendData(res, await shifts.listDrivers())),
  );

  router.get(
    '/admin/vehicles',
    onlyAdmin,
    asyncHandler(async (req, res) => sendData(res, await shifts.listVehicles())),
  );

  router.get(
    '/admin/shifts',
    onlyAdmin,
    asyncHandler(async (req, res) => {
      const query = {
        from: req.query.from,
        to: req.query.to,
        driverUserId: parseOptionalId(req.query.driverUserId, 'driverUserId'),
        vehicleId: parseOptionalId(req.query.vehicleId, 'vehicleId'),
      };
      sendData(res, await shifts.listShifts(query));
    }),
  );

  router.post(
    '/admin/shifts',
    onlyAdmin,
    json,
    asyncHandler(async (req, res) => sendData(res, await shifts.createShift(req.body), 201)),
  );

  router.patch(
    '/admin/shifts/:shiftId',
    onlyAdmin,
    json,
    asyncHandler(async (req, res) => {
      sendData(res, await shifts.updateShift(parseId(req.params.shiftId, 'shiftId'), req.body));
    }),
  );

  router.use(martinErrorHandler);
  return router;
}

module.exports = { createAdminRouter };
