# PROPUESTAS DE CAMBIO Y PUNTOS DE COORDINACIÓN (contrato v1.1)

No se modificó ningún archivo del contrato: ni `schema.sql`, ni las rutas, campos o enums de `CONTRATO_API.md`. Aquí se registran las contradicciones y dependencias encontradas, y cómo se resolvieron **dentro** del contrato.

**Estados posibles:**
- **Resuelto sin cambio:** se implementó sin tocar el contrato.
- **Propuesta:** requiere la aprobación de ambos integrantes antes de aplicarse (sería la v1.2).

---

## P1. ID `RED-02` duplicado en la ERS — Pendiente (profesor)

La ERS usa `RED-02` para "Consulta de paraderos" y para "Visualización de vehículos".

- **Hecho:** en el código y en las pruebas se identifica por su nombre: *Visualización de vehículos*.
- **Propuesta:** consultar al cliente si pasa a llamarse `RED-03`.
- **Impacto:** solo documental.

## P2. `GET /vehicles/active` no trae nombres de línea ni de recorrido — Propuesta (aditiva)

La ERS pide mostrar "Línea y recorrido", pero la respuesta del contrato solo trae `lineId` y `routeId`.

- **Hecho, sin cambiar el contrato:** la pantalla obtiene los nombres de los endpoints públicos de Gianny (`GET /lines`, `GET /lines/:id/routes`). **Esto crea una dependencia del catálogo de Gianny.**
- **Propuesta v1.2:** agregar los campos opcionales `lineCode`, `lineName`, `lineColorHex`, `startLabel` y `endLabel`.
- **Impacto:** el cambio es compatible con lo existente (solo agrega campos) y evitaría 1 + N consultas.

## P3. Formas de respuesta no definidas en el contrato — Resuelto sin cambio (documentado)

El contrato lista estas rutas pero no define la forma de la respuesta. Se usó esta forma; conviene incorporarla al contrato v1.2:

- **`GET /driver/shifts` y `GET /admin/shifts`:** `data` es un arreglo de turnos con esta forma:
  ```text
  {
    id, status, plannedStartAt, plannedEndAt, actualStartAt, actualEndAt, toleranceMinutes,
    punctuality: { status: pending|on_time|late|not_started_late, delayMinutes, earlyFinish },
    driver: { id, fullName, enabled },
    vehicle: { id, code, plate, status },
    trips: [ {
      shiftTripId, sequence, plannedStartAt, plannedEndAt, routeId, direction, startLabel, endLabel,
      line: { id, code, name, colorHex },
      trip: { tripId, status, startedAt, finishedAt, lastPassedSequence } | null
    } ]
  }
  ```
- **`POST /driver/shifts/:id/start|finish`, `POST /admin/shifts`, `PATCH /admin/shifts/:id`:** devuelven el mismo objeto de turno.
- **`POST /driver/trips/:id/finish`:** devuelve `{ tripId, status: "finished", finishedAt, closedRequests, endedLinks }`.
- **`POST /driver/alert-events/:id/seen`:** devuelve `{ eventId, seenAt }`.
- **`GET /admin/drivers`:** devuelve `[{ id, fullName, email, enabled }]`.
- **`GET /admin/vehicles`:** devuelve `[{ id, code, plate, capacity, status, enabled, assignable }]`.
- **`PATCH /admin/shifts/:id` acepta además `{ "status": "cancelled" }`,** solo para turnos que aún no inician.
- **Códigos 201/200:** `POST /driver/shift-trips/:id/start` y `POST /driver/trips/:id/locations` responden **201**, porque crean un recurso.

## P4. Quién crea `driver_alert_events` — Resuelto sin cambio

El contrato no indica si el evento lo crea `POST /me/stop-requests` (Gianny) o el módulo del conductor (Martín).

- **Hecho:** `GET /driver/trips/:id/stop-alerts` crea el evento con `INSERT OR IGNORE` para cada paradero con solicitudes pendientes.
- **Compatibilidad:** si Gianny también lo inserta al crear la solicitud, sigue funcionando gracias a `UNIQUE(trip_id, trip_stop_id, type)`.
- **Acuerdo sugerido:** Gianny **no** necesita crear eventos.

## P5. Estado inicial de la solicitud (`sent` o `next`) — Coordinación con Gianny

- **Regla aplicada por Martín:** `next` = el paradero de **menor secuencia mayor que `last_passed_sequence`**.
- **Al iniciar el viaje,** `last_passed_sequence = 0`, así que el "siguiente paradero" es el de secuencia 1 (el origen).
- **Mantención del estado:** el módulo de Martín recalcula `next` en cada lectura GPS y en cada consulta de alertas.
- **Acuerdo sugerido:** Gianny crea la solicitud con `status = 'next'` si `sequence === lastPassedSequence + 1`, y con `'sent'` en otro caso. Si siempre la crea como `'sent'`, Martín la corrige en ≤ 5 s.

## P6. Formato de `routes.geometry_json` — Coordinación con Gianny

El esquema solo exige JSON válido.

- **Hecho:** se acepta un arreglo de `{ latitude, longitude }` (formato de `geometry` en el contrato); también se toleran `{ lat, lng }`.
- **Respaldo:** si la geometría está vacía o tiene menos de 2 puntos, el avance usa los paraderos del viaje en orden.
- **Acuerdo sugerido:** el seed de Gianny guarda `geometry_json` con el mismo formato que devuelve `GET /routes/:id`.

## P7. Algoritmo de avance GPS — Propuesta de parámetros (el contrato pide acordarlos)

Implementado en `driver/tripProgress.js`. Los parámetros están en `martin-common/config.js`.

**Cómo funciona:**
- proyecta cada lectura sobre la polilínea, solo hacia adelante desde el último paradero superado (−50 m de tolerancia);
- un paradero se da por superado con **2 lecturas consecutivas**:
  - las dos a ≤ 60 m de la ruta,
  - las dos ≥ 15 m más allá del paradero,
  - con menos de 120 s entre ellas;
- el avance es monótono, con una guardia en SQL.

**Lecturas que se rechazan:**
- precisión > 100 m;
- antigüedad > 120 s;
- adelantadas > 120 s;
- saltos > 45 m/s;
- lecturas desordenadas.

**Límite conocido:**
- en recorridos que pasan dos veces por el mismo tramo dentro de **un mismo** sentido, la proyección puede subestimar el avance;
- **qué pasa entonces:** conserva el valor anterior, nunca adelanta en falso;
- el paradero **final** no se marca como superado, porque el bus se detiene ahí. Sus solicitudes se cierran con `trip_finished` al finalizar el viaje.

## P8. Margen de tolerancia — Resuelto sin cambio

La ERS (ADM-03) dice "margen de tolerancia definido por el administrador"; el esquema tiene `shifts.tolerance_minutes`.

- **Hecho:** la tolerancia se define **por turno** al crearlo o editarlo, y es editable incluso con el turno en curso.
- **Cálculo de atraso:**
  - `punctuality = late` si el inicio real supera el inicio planificado + la tolerancia;
  - `not_started_late` si el turno no se ha iniciado pasado ese margen.
- **Se conservan** las horas originales.

## P9. Dependencias técnicas a confirmar antes de integrar

1. **Versión de Expo:** la base del repo (`frontendmobile`) usa **SDK 57**. Las pantallas de Martín se probaron en SDK 58 y compilan en SDK 57. Hay que usar una sola versión, la que admita Expo Go en los teléfonos del equipo.
2. **Librería de SQLite y forma del middleware de sesión:** se resuelve con los adaptadores `db` y `auth` (ver `INTEGRACION.md`), sin reescribir los módulos.
3. **Hash de contraseñas:** el seed de Martín recibe la función `hashPassword` de Gianny para que los conductores demo puedan iniciar sesión con la autenticación final.
4. **GPS en segundo plano:** no se implementa. `expo-location` con `watchPositionAsync` solo actualiza con la app abierta, así que la pantalla del viaje mantiene el teléfono encendido. Para el envío en segundo plano habría que usar `startLocationUpdatesAsync`, que requiere un *development build* y no es compatible con Expo Go.
5. **Mapas:** `react-native-maps` funciona en Expo Go sin API key. Para publicar en tiendas hace falta una API key de Google Maps (fuera del alcance de esta entrega).
