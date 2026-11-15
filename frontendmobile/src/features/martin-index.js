// Punto de entrada unico del frontend de Martin para la integracion.
// La app final de Gianny monta estas pantallas en sus rutas de Expo Router
// (ver docs/martin/INTEGRACION.md) y envuelve la app con MartinApiProvider.

export { createMartinApi, ApiRequestError } from './martin-common/api';
export { MartinApiProvider, useMartinApi } from './martin-common/MartinApiContext';
export { martinRoutes } from './martin-common/routes';

export { default as ActiveVehiclesScreen } from './vehicles/ActiveVehiclesScreen';
export { default as DriverShiftsScreen } from './driver/DriverShiftsScreen';
export { default as DriverTripScreen } from './driver/DriverTripScreen';
export { default as AdminShiftsScreen } from './admin/AdminShiftsScreen';
export { default as ShiftFormScreen } from './admin/ShiftFormScreen';
