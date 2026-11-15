'use strict';

/**
 * Parametros tecnicos acordados en el contrato v1.1 (no son umbrales de la ERS).
 * Se pueden sobrescribir con variables de entorno o pasando `config` al montar
 * los routers.
 */
const DEFAULT_CONFIG = Object.freeze({
  // Consulta automatica en pantallas visibles (README del contrato: 5 s).
  pollIntervalMs: 5000,
  // Ubicacion atrasada tras 30 s sin una lectura nueva valida.
  staleAfterSeconds: 30,
  // Ventana para iniciar un turno antes de su hora planificada.
  shiftEarlyStartMinutes: 120,
  gps: {
    // Lecturas con peor precision se rechazan y no cuentan como validas.
    maxAccuracyMeters: 100,
    // Lecturas demasiado antiguas o del futuro (reloj del telefono) se rechazan.
    maxSampleAgeSeconds: 120,
    maxFutureSkewSeconds: 120,
    // Saltos imposibles para un bus urbano (~160 km/h) se rechazan.
    maxSpeedMetersPerSecond: 45,
    // Distancia maxima a la linea del recorrido para considerar una lectura fiable.
    maxLateralMeters: 60,
    // Hay que avanzar este margen mas alla del paradero para darlo por superado.
    passMarginMeters: 15,
    // Cantidad de lecturas consecutivas que deben confirmar el avance (histeresis).
    confirmSamples: 2,
    // Las lecturas usadas para confirmar deben estar dentro de esta ventana.
    confirmWindowSeconds: 120,
    // Retroceso tolerado al proyectar sobre la ruta (ruido GPS).
    backtrackMeters: 50,
  },
});

function readNumberEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function resolveConfig(overrides = {}) {
  const fromEnv = {
    pollIntervalMs: readNumberEnv('VOYBUS_POLL_INTERVAL_MS'),
    staleAfterSeconds: readNumberEnv('VOYBUS_GPS_STALE_SECONDS'),
  };
  const merged = { ...DEFAULT_CONFIG, gps: { ...DEFAULT_CONFIG.gps } };
  for (const [key, value] of Object.entries(fromEnv)) {
    if (value !== undefined) merged[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'gps' && value) merged.gps = { ...merged.gps, ...value };
    else if (value !== undefined) merged[key] = value;
  }
  return merged;
}

module.exports = { DEFAULT_CONFIG, resolveConfig };
