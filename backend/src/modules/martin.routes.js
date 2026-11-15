'use strict';

const express = require('express');
const { normalizeDeps } = require('./martin-common/deps');
const { createVehiclesRouter } = require('./vehicles/vehicles.router');
const { createDriverRouter } = require('./driver/driver.router');
const { createAdminRouter } = require('./admin/admin.router');

/**
 * Punto unico de integracion de los modulos de Martin.
 *
 * En el servidor final (Gianny):
 *   const { createMartinRouter } = require('./modules/martin.routes');
 *   app.use('/api/v1', createMartinRouter({ db, auth }));
 *
 * Ver docs/martin/INTEGRACION.md para el formato de `db` y `auth`.
 */
function createMartinRouter(deps) {
  const normalized = normalizeDeps(deps);
  const router = express.Router();
  router.use(createVehiclesRouter(normalized));
  router.use(createDriverRouter(normalized));
  router.use(createAdminRouter(normalized));
  return router;
}

module.exports = {
  createMartinRouter,
  createVehiclesRouter: (deps) => createVehiclesRouter(normalizeDeps(deps)),
  createDriverRouter: (deps) => createDriverRouter(normalizeDeps(deps)),
  createAdminRouter: (deps) => createAdminRouter(normalizeDeps(deps)),
};
