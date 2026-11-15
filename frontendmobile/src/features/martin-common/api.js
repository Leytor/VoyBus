// Cliente HTTP de los modulos de Martin, segun CONTRATO_API v1.1.
// La URL base y el token los entrega la app final (configuracion y sesion de Gianny).

const REQUEST_TIMEOUT_MS = 10000;

export class ApiRequestError extends Error {
  constructor({ status, code, message, details }) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details || {};
  }
}

export function createMartinApi({ baseUrl, getToken }) {
  const root = String(baseUrl || '').replace(/\/+$/, '');

  async function request(method, path, { body, auth = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && getToken) {
      const token = await getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${root}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch {
      throw new ApiRequestError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'Servidor no disponible. Revisa tu conexión e inténtalo de nuevo.',
      });
    } finally {
      clearTimeout(timer);
    }

    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (!response.ok) {
      const error = (json && json.error) || {};
      throw new ApiRequestError({
        status: response.status,
        code: error.code || `HTTP_${response.status}`,
        message: error.message || 'Ocurrió un error inesperado.',
        details: error.details,
      });
    }
    return json ? json.data : null;
  }

  const query = (params) => {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
    return entries.length ? `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
  };

  return {
    // --- Vehiculos (publico)
    getActiveVehicles: (lineId) => request('GET', `/vehicles/active${query({ lineId })}`, { auth: false }),

    // --- Conductor (VEH-01, VEH-02)
    getDriverShifts: () => request('GET', '/driver/shifts'),
    startShift: (shiftId) => request('POST', `/driver/shifts/${shiftId}/start`),
    finishShift: (shiftId) => request('POST', `/driver/shifts/${shiftId}/finish`),
    startTrip: (shiftTripId) => request('POST', `/driver/shift-trips/${shiftTripId}/start`),
    sendLocation: (tripId, sample) => request('POST', `/driver/trips/${tripId}/locations`, { body: sample }),
    finishTrip: (tripId) => request('POST', `/driver/trips/${tripId}/finish`),
    getStopAlerts: (tripId) => request('GET', `/driver/trips/${tripId}/stop-alerts`),
    markAlertSeen: (eventId) => request('POST', `/driver/alert-events/${eventId}/seen`),

    // --- Administracion (ADM-03)
    getAdminDrivers: () => request('GET', '/admin/drivers'),
    getAdminVehicles: () => request('GET', '/admin/vehicles'),
    getAdminShifts: (params = {}) => request('GET', `/admin/shifts${query(params)}`),
    createShift: (body) => request('POST', '/admin/shifts', { body }),
    updateShift: (shiftId, body) => request('PATCH', `/admin/shifts/${shiftId}`, { body }),

    // --- Catalogo (endpoints publicos de Gianny, RED-01)
    getLines: () => request('GET', `/lines${query({ page: 1, pageSize: 100 })}`, { auth: false }),
    getLineRoutes: (lineId) => request('GET', `/lines/${lineId}/routes`, { auth: false }),
    getRoute: (routeId) => request('GET', `/routes/${routeId}`, { auth: false }),
  };
}
