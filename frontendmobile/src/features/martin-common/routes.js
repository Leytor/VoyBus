// Rutas de Expo Router donde la app final monta las pantallas de Martin.
// Si Gianny usa otras rutas, basta con cambiarlas aqui.
export const martinRoutes = {
  vehicles: '/vehicles',
  driverHome: '/driver',
  driverTrip: (tripId) => `/driver/trip/${tripId}`,
  adminShifts: '/admin',
  adminShiftForm: (shiftId) => (shiftId ? `/admin/shift?shiftId=${shiftId}` : '/admin/shift'),
};
