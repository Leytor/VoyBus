# Integración VoyBus Gianny + Martín

**Base obligatoria:** `CONTRATO_API.md` v1.1 y `voybus-backend/database/schema.sql`. No se modificó el esquema compartido enviado a Martín.

## Archivos finales propiedad de Gianny

- `voybus-backend/src/lib/db.js`: instancia SQLite, transacciones y modelo común.
- `voybus-backend/src/services/auth.js`: `login`, `guest`, `resolveToken`, `middleware`, `revoke`.
- `voybus-backend/src/services/transport.js`: datos de líneas, recorridos y paraderos.
- `voybus-backend/src/services/travel.js`: vínculos y solicitudes; **exporta `syncTripRequestStatuses(db, tripId)`**.
- `voybus-backend/src/app.js`, `src/server.js`: único servidor Express final.
- `voybus-frontend/app/_layout.tsx`: único navegador Expo Router.
- `voybus-frontend/src/contexts/AuthContext.tsx`: sesión común para ambos roles.
- `voybus-frontend/src/lib/api.ts`: `api<T>(path, options)`; prefijo `/api/v1`.

## Instrucciones obligatorias para Martín

1. Montar **sus routers** de vehículo activo, conductor, alertas y administración dentro del `app` Express existente, bajo `/api/v1`. No crear un segundo servidor definitivo.
2. Utilizar `getDb()` y el mismo archivo SQLite; no ejecutar una segunda migración incompatible ni sustituir `schema.sql`.
3. Para sus rutas seguras, utilizar `auth.middleware(db, ['driver'])` o `auth.middleware(db, ['admin'])` como corresponde. El middleware agrega `req.actor`, que incluye `id`, `role`, `sessionId` para registrados; **no confiar en IDs enviados desde el cliente**.
4. Cada vez que se actualice `trips.last_passed_sequence`, llamar a `syncTripRequestStatuses(db, tripId)` en **la misma transacción de su servicio GPS**; cuando cambie `trips.status` a `finished`, ejecutar también el sincronizador dentro de la transacción de finalización. Así se guardan `sent`, `next`, `closed` y el cierre de los vínculos.
5. Martín es el único responsable de actualizar `last_passed_sequence` a partir del GPS. Gianny únicamente lo lee.
6. Al crear un viaje desde `shift_trips`, Martín debe copiar `route_stops` a `trip_stops`, guardando `stop_code_snapshot`, `stop_name_snapshot`, `latitude_snapshot`, `longitude_snapshot` y la secuencia de ese viaje. Los `tripStopId` generados son los que consumirá VIA-02.
7. `driver_alert_events` es creado **una única vez** por nuestro `submitRequest` al recibir la primera solicitud de un paradero. Martín consulta las solicitudes pendientes con `stop_requests.status IN ('sent','next')`, agrupa por `trip_stop_id` y cuenta registros. No crear eventos adicionales por cada pasajero; usar `driver_alert_deliveries` para controlar qué sonido ya se reprodujo.
8. Incorporar las pantallas de Martín a `app/` y enlazarlas desde navegación para cuentas `driver`/`admin`; no crear otra `AuthProvider` ni sesión alternativa.
9. Martín puede crear fixtures independientes en su rama, pero en la versión integrada se utiliza un único seed coordinado. El script `demo-trip.js` se utiliza **solo** para la demostración aislada de Gianny y no debe reemplazar el inicio de viaje GPS.

## Contrato de identidad

`GET /auth/me`:

```json
{"data":{"actorType":"user","user":{"id":2,"role":"driver","fullName":"Conductor de prueba"}}}
```

El token llega en `Authorization: Bearer <token>` y no debe exponerse en pantallas ni logs.

## Unión de ramas y conflictos

1. Trabajar en **dos repositorios comunes** (`voybus-frontend` y `voybus-backend`), con ramas `main`, `dev`, `GiannyParedes`, `MartinSolari`, partiendo del mismo commit inicial.
2. Gianny sube los archivos bajo su propiedad. Martín sube sus módulos en rutas propias, evitando cambios simultáneos a los archivos raíz siempre que pueda.
3. Fusionar en `dev`, y **montar** rutas/pantallas de Martín en el servidor y navegador raíz.
4. Unificar dependencias en `package.json` una sola vez y ejecutar instalación limpia.
5. Probar el flujo real completo: administrador crea turno -> conductor inicia GPS -> pasajero se vincula -> solicita parada -> conductor recibe alertas -> GPS cambia estado -> termina viaje.
6. Si Martín considera indispensable cambiar un endpoint o una tabla, documentarlo antes y comunicarlo a Gianny. Nunca cambiar silenciosamente el contrato.

## Limitaciones antes de la unión

El seed de Gianny crea un solo vehículo y viaje ficticio mediante `demo:trip`. La visualización de vehículos, las asignaciones reales de conductores, el GPS y las alertas operativas no forman parte de este ZIP. Las pruebas del pasajero con progreso simulado no prueban automáticamente VEH-01/VEH-02/ADM-03.
