# VoyBus — Contrato API REST compartido v1.1

**Estado:** contrato acordado como referencia para el desarrollo paralelo; sin implementación aún. Base: `/api/v1`. Propietarios: **G = Gianny**, **M = Martín**, **C = uso común con implementación por G en autenticación**.

## Convenciones obligatorias

- Peticiones/respuestas `application/json`, propiedades `camelCase`, identificadores numéricos, instantes UTC `YYYY-MM-DDTHH:mm:ss.sssZ`.
- Respuesta exitosa: `{ "data": ... }`; listas pueden añadir `"meta": { "total": 10, "page": 1, "pageSize": 20 }`.
- Error: `{ "error": { "code": "STOP_ALREADY_PASSED", "message": "El paradero ya fue superado.", "details": {} } }`.
- HTTP 400 formato inválido, 401 no autenticado, 403 rol/propiedad insuficiente, 404 recurso inexistente, 409 conflicto de estado o duplicado, 422 dato semánticamente inválido, 503 servicio no disponible.
- Token de sesión en `Authorization: Bearer <token>`, generado por el backend, almacenado seguro en el móvil. Token invitado puede acceder solo a recursos de su vínculo; token conductor y admin se valida por rol. Los tokens no se escriben en logs.
- Cualquier `PUT/PATCH/POST` valida de nuevo la información en el servidor. Nunca confiar en `driverId`, `passengerId` o `guestId` proporcionados por el cliente como evidencia de identidad.
- Todos los endpoints que generan datos persistentes deben ejecutarse transaccionalmente cuando cambien varias tablas.

## Autenticación mínima compartida (implementa Gianny; consume Martín)

| Método | Ruta | Acceso | Uso |
|---|---|---|---|
| POST | `/auth/login` | Público | Correo/contraseña de usuarios demo; emite sesión para `passenger`, `driver`, `admin` según cuenta existente |
| POST | `/auth/guest` | Público | Emite sesión invitado temporal |
| POST | `/auth/logout` | Autenticado | Revoca la sesión actual |
| GET | `/auth/me` | Autenticado | Devuelve identidad y rol de la sesión, sin datos sensibles |

`POST /auth/login` request: `{ "email":"driver.demo@voybus.local", "password":"<contraseña-demo>" }`; response: `{ "data": { "token":"<token>", "expiresAt":"...Z", "user": { "id": 4, "role":"driver", "fullName":"Conductor demo" } } }`. Los nombres de correos son ilustrativos; generar seed auténtico al implementar. La contraseña demo se documenta solamente para entorno local, nunca en código de producción.

`POST /auth/guest` response: `{ "data": { "token":"<token>", "expiresAt":"...Z", "actorType":"guest" } }`.

## Catálogo de transporte (G)

| Método | Ruta | Acceso | Objetivo |
|---|---|---|---|
| GET | `/lines?search=&page=&pageSize=` | Público | Lista de líneas visibles, búsqueda nombre/código, estado suspendido advertido |
| GET | `/lines/:lineId` | Público | Código, nombre, color, estado |
| GET | `/lines/:lineId/routes` | Público | Sentidos, horarios, inicio/término |
| GET | `/routes/:routeId` | Público | Línea, dirección, días/horarios, `geometry` y paraderos en orden |
| GET | `/stops?search=&routeId=&page=&pageSize=` | Público | Búsqueda nombre/código y filtro por recorrido |
| GET | `/stops/:stopId` | Público | Ubicación, líneas y sentidos asociados |
| GET | `/me/favorite-stops` | Pasajero registrado | Listar favoritos |
| PUT | `/me/favorite-stops/:stopId` | Pasajero registrado | Guardar favorito (idempotente) |
| DELETE | `/me/favorite-stops/:stopId` | Pasajero registrado | Eliminar favorito (idempotente) |

`GET /lines` ejemplo:

```json
{
  "data": [
    { "id": 1, "code": "DEMO-01", "name": "Línea demostración 1", "colorHex": "#C62828", "status": "active", "startLabel": "Inicio demo", "endLabel": "Fin demo" }
  ],
  "meta": { "total": 1, "page": 1, "pageSize": 20 }
}
```

`GET /routes/10` ejemplo reducido:

```json
{
  "data": {
    "id": 10, "lineId": 1, "direction": "outbound",
    "serviceDays": [1,2,3,4,5], "startTimeLocal": "06:00", "endTimeLocal": "23:00",
    "startLabel": "Inicio demo", "endLabel": "Fin demo",
    "geometry": [{"latitude":-23.65,"longitude":-70.40},{"latitude":-23.66,"longitude":-70.41}],
    "stops": [
      {"routeStopId":101,"stopId":1,"sequence":1,"code":"P001","name":"Paradero demo 1","latitude":-23.65,"longitude":-70.40},
      {"routeStopId":102,"stopId":2,"sequence":2,"code":"P002","name":"Paradero demo 2","latitude":-23.66,"longitude":-70.41}
    ]
  }
}
```

Los códigos, paraderos, coordenadas y líneas de los ejemplos son **ficticios**, exclusivamente para explicar el formato.

## Vinculación y solicitudes de pasajero (G)

| Método | Ruta | Acceso | Objetivo |
|---|---|---|---|
| GET | `/vehicles/resolve/:vehicleCode` | Público | Validar código/QR y mostrar vehículo, línea, sentido, viaje activo o motivo de indisponibilidad |
| POST | `/trip-links` | Pasajero o invitado | Vincular la sesión actual con el viaje activo del vehículo indicado |
| GET | `/me/trip-link` | Pasajero o invitado | Obtener vínculo activo o `null` |
| DELETE | `/me/trip-link` | Pasajero o invitado | Desvinculación voluntaria (sin borrar historial) |
| GET | `/me/trip-link/stops` | Pasajero o invitado | Lista de paraderos futuros del viaje (secuencia > última pasada) |
| POST | `/me/stop-requests` | Pasajero o invitado | Crear solicitud pendiente para un paradero futuro |
| GET | `/me/stop-request` | Pasajero o invitado | Obtener la solicitud más reciente del viaje vinculado; polling automático |

`GET /vehicles/resolve/VB-010` respuesta ejemplar (cuando hay viaje activo):

```json
{
  "data": {
    "vehicle": { "id": 7, "code": "VB-010" },
    "trip": { "id": 51, "status": "active", "lineId": 1, "routeId": 10, "direction": "outbound" }
  }
}
```

QR: `voybus://vehicle/VB-010` (mismo código manual `VB-010`). La aplicación parsea el URI, pero **el backend verifica siempre** la existencia de un viaje activo. Un código QR no concede permisos especiales.

`POST /trip-links` request `{ "vehicleCode": "VB-010" }` y response:

```json
{
  "data": { "id": 300, "tripId": 51, "vehicleCode": "VB-010", "lineCode": "DEMO-01", "routeId": 10, "direction": "outbound", "linkedAt": "2026-11-15T18:00:00.000Z" }
}
```

Una sesión ya vinculada a otro viaje recibe `409 ACTIVE_TRIP_LINK_EXISTS`; vehículo sin viaje: `409 NO_ACTIVE_TRIP`; formato inválido: `422 INVALID_VEHICLE_CODE`.

`GET /me/trip-link/stops` incluye `lastPassedSequence`, `locationUpdatedAt`, `locationStale` y objetos:

```json
{
  "data": {
    "tripId": 51, "lastPassedSequence": 1, "locationUpdatedAt": "2026-11-15T18:01:00.000Z", "locationStale": false,
    "stops": [ { "tripStopId": 502, "stopId": 2, "sequence": 2, "code": "P002", "name": "Paradero demo 2", "isNext": true } ]
  }
}
```

`POST /me/stop-requests` request `{ "tripStopId": 502, "idempotencyKey": "uuid-v4-del-cliente" }`. `tripStopId` **no es** `stopId` ni `routeStopId`: se refiere al paradero congelado de **ese viaje**. El servidor determina `tripId` y `tripLinkId` a partir de la sesión; no los acepta como autoridad del cliente.

```json
{
  "data": {
    "id": 800, "tripId": 51, "tripStopId": 502, "destination": { "code": "P002", "name": "Paradero demo 2", "sequence": 2 },
    "status": "next", "requestedAt": "2026-11-15T18:01:10.000Z", "closedAt": null, "closureReason": null,
    "locationUpdatedAt": "2026-11-15T18:01:00.000Z", "locationStale": false
  }
}
```

`GET /me/stop-request` usa el mismo objeto o `{ "data": null }`. `409 PENDING_REQUEST_EXISTS` si existe solicitud pendiente con otro `idempotencyKey`; `409 STOP_ALREADY_PASSED` si `sequence <= lastPassedSequence`; `409 NO_ACTIVE_TRIP_LINK` si no tiene vínculo. Si se reenvía el mismo `idempotencyKey`, devuelve la misma solicitud sin crear un segundo registro.

Estados: `sent`, `next`, `closed`. Cierres: `stop_passed` o `trip_finished`. **No se reporta detención real confirmada.**

## Vehículos, conductor y turnos (M)

| Método | Ruta | Acceso | Objetivo |
|---|---|---|---|
| GET | `/vehicles/active?lineId=` | Público | Muestra solo viajes `active` con posición y timestamp; elimina viajes terminados |
| GET | `/driver/shifts` | Conductor | Ver turnos/vehículo/recorridos asignados |
| POST | `/driver/shifts/:shiftId/start` | Conductor asignado | Marcar inicio de turno, sin iniciarle automáticamente todos los viajes |
| POST | `/driver/shifts/:shiftId/finish` | Conductor asignado | Finalizar turno cuando corresponda |
| POST | `/driver/shift-trips/:shiftTripId/start` | Conductor asignado | Crear/activar viaje y copiar `route_stops` a `trip_stops` |
| POST | `/driver/trips/:tripId/locations` | Conductor del viaje | Enviar ubicación GPS y actualizar progreso confiable |
| POST | `/driver/trips/:tripId/finish` | Conductor del viaje | Finalizar viaje, cerrar solicitudes y vínculos |
| GET | `/driver/trips/:tripId/stop-alerts` | Conductor del viaje | Pendientes agrupadas por `tripStopId` y ordenadas, con alertas no vistas |
| POST | `/driver/alert-events/:eventId/seen` | Conductor del viaje | Guardar automáticamente recepción del aviso para no reproducirlo otra vez |
| GET | `/admin/drivers` | Administrador | Conductores habilitados para asignar |
| GET | `/admin/vehicles` | Administrador | Vehículos y estados operativos |
| POST | `/admin/shifts` | Administrador | Crear turno y viajes planificados, validando solapamientos |
| PATCH | `/admin/shifts/:shiftId` | Administrador | Modificar turno/recorridos; validar conflictos |
| GET | `/admin/shifts` | Administrador | Consultar turnos y asignaciones |

`GET /vehicles/active?lineId=1`:

```json
{
  "data": [
    {"vehicleCode":"VB-010", "tripId":51, "lineId":1, "routeId":10, "direction":"outbound", "latitude":-23.65, "longitude":-70.40, "locationUpdatedAt":"2026-11-15T18:01:00.000Z", "locationStale":false}
  ]
}
```

`POST /driver/shift-trips/70/start`: server checks conductor actual, turno activo, vehículo disponible, ruta vigente y sin viaje simultáneo; devuelve `{ "data": {"tripId":51, "status":"active", "vehicleCode":"VB-010", "routeId":10, "startedAt":"...Z" } }`.

`POST /driver/trips/51/locations`:

```json
{ "latitude": -23.65001, "longitude": -70.40003, "accuracyMeters": 8.3, "sampledAt": "2026-11-15T18:01:00.000Z" }
```

Response contiene `{ "data": { "tripId": 51, "receivedAt":"...Z", "lastPassedSequence": 1, "locationStale": false } }`. No se debe permitir al cliente mandar `lastPassedSequence` como decisión autoritativa. Un GPS perdido conserva última posición y timestamp y **no** finaliza el viaje.

`GET /driver/trips/51/stop-alerts`:

```json
{
  "data": {
    "pending": [ {"tripStopId":502, "sequence":2, "stopName":"Paradero demo 2", "requestCount":2} ],
    "unseenEvents": [ {"eventId":901, "tripStopId":502, "stopName":"Paradero demo 2", "createdAt":"...Z"} ]
  }
}
```

El cliente reproduce la alerta una sola vez por `eventId`; luego llama a `/driver/alert-events/:eventId/seen` automáticamente. La actualización de contadores no reemite sonido. Los eventos ya vistos no vuelven en `unseenEvents` después de reconectar.

`POST /admin/shifts` ejemplo:

```json
{
  "driverUserId": 4, "vehicleId": 7,
  "plannedStartAt": "2026-11-16T12:00:00.000Z", "plannedEndAt": "2026-11-16T20:00:00.000Z", "toleranceMinutes": 10,
  "plannedTrips": [ { "routeId":10, "sequence":1, "plannedStartAt":"2026-11-16T12:30:00.000Z", "plannedEndAt":"2026-11-16T14:00:00.000Z" } ]
}
```

Validaciones: superposición por conductor o vehículo, intervalos de cada viaje contenidos dentro del turno, secuencia única, ruta habilitada, conductor habilitado y vehículo `operational` o `operational_with_notes`. Rechazos `409 SHIFT_OVERLAP`, `409 VEHICLE_UNAVAILABLE`, `409 DRIVER_UNAVAILABLE` o `422 INVALID_TRIP_SCHEDULE`.

## Ejecución de actualizaciones sin websockets

Se permite polling automático, por ejemplo cada 3–5 segundos mientras una pantalla relevante está visible (la cifra es **propuesta técnica**, no un tiempo exigido en la ERS). Ante conexión fallida, conservar último dato, indicar hora y antigüedad, aplicar reintentos moderados. El equipo debe acordar un solo umbral `stale` en backend (propuesta inicial: 20–30 segundos) y usarlo consistentemente; evitar mostrar `open now` o progreso estimado como confirmado. No hacer peticiones continuas al estar la pantalla en segundo plano sin necesidad.

## Cambios de contrato

Cualquier endpoint añadido, campo alterado o estado nuevo debe quedar registrado en la revisión compartida de este archivo antes de implementarse. Ningún integrante debe modificar silenciosamente el contrato para acomodar un módulo local.

## Nota de integración v1.1

Gianny implementa una única autenticación de backend y las rutas `/auth/*`, con acceso por roles. Martín **no** agrega una segunda implementación definitiva ni otro esquema de usuarios. Si necesita trabajar mientras la autenticación de Gianny no está lista, puede inyectar un actor de prueba en un entorno local aislado de sus módulos; al integrar deberá usar el middleware de autenticación común. No cambiar payloads ni respuestas para acomodar mocks.

Parámetros operativos acordados para la primera implementación: consultas automáticas en pantallas visibles aproximadamente cada 5 segundos; criterio de GPS atrasado: 30 segundos desde la última muestra válida. Ambos se configuran centralmente y se prueban; no son condiciones expresamente fijadas en la ERS.
