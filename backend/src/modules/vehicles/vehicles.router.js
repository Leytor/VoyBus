'use strict';

const express = require('express');
const { asyncHandler, sendData, martinErrorHandler } = require('../martin-common/http');
const { parseOptionalId } = require('../martin-common/validate');
const { createVehiclesService } = require('./vehicles.service');

/**
 * GET /vehicles/active?lineId=   (publico, sin iniciar sesion)
 * Montar bajo /api/v1.
 */
function createVehiclesRouter(deps) {
  const service = createVehiclesService(deps);
  const router = express.Router();

  router.get(
    '/vehicles/active',
    asyncHandler(async (req, res) => {
      const lineId = parseOptionalId(req.query.lineId, 'lineId');
      const vehicles = await service.listActiveVehicles({ lineId });
      sendData(res, vehicles);
    }),
  );

  router.use(martinErrorHandler);
  return router;
}

module.exports = { createVehiclesRouter };
