# Módulos de Martín — guía de integración (contrato v1.1)

**Requerimientos:**

| Requerimiento | Nombre |
|---|---|
| RED-02* | Visualización de vehículos (ID duplicado en la ERS) |
| VEH-01 | Gestión del viaje y ubicación GPS |
| VEH-02 | Recepción de alertas de parada |
| ADM-03 | Gestión de turnos y asignaciones |

**Lo que no se modificó:** `schema.sql`, rutas, campos y enums del `CONTRATO_API.md`. Tampoco hay código de autenticación, catálogo, VIA-01..03, `app/_layout` ni `index.js`, que son de Gianny.

## Contenido de esta rama

| Ruta | Contenido |
|---|---|
| `backend/src/modules/vehicles/` | Visualización de vehículos |
| `backend/src/modules/driver/` | VEH-01 (turno, viaje, GPS, avance monótono) y VEH-02 (alertas) |
| `backend/src/modules/admin/` | ADM-03 (turnos con validaciones) |
| `backend/src/modules/martin-common/` | Errores del contrato, configuración, validaciones, consultas de turnos, adaptadores SQLite |
| `backend/src/modules/martin.routes.js` | Punto único de montaje |
| `backend/src/seeds/martinSeed.js` | Seed: 12 vehículos, 5 conductores (1 deshabilitado) y turnos |
| `backend/test/martin/` | 35 pruebas; `support/` contiene fixtures **solo de prueba** (auth simulada, catálogo, copia de `schema.sql`) |
| `backend/scripts/simulateGps.js` | Herramienta de demostración: GPS simulado vía API |
| `frontendmobile/src/features/` | Pantallas, hooks y cliente API (`martin-index.js` exporta todo) |

## 1. Backend (Gianny monta)

```js
const { createMartinRouter } = require('./src/modules/martin.routes');
app.use(express.json());
app.use('/api/v1', createMartinRouter({ db, auth }));
```

**`db`** es un adaptador con `get(sql, params)`, `all`, `run` → `{ changes, lastInsertRowid }` y `transaction(async fn)`.
- Ya incluidos: `createNodeSqliteAdapter(conexion)` para `node:sqlite` y `createBetterSqliteAdapter(conexion)` para `better-sqlite3`.
- Para otra librería: un adaptador equivalente de ~20 líneas.
- Siempre con `PRAGMA foreign_keys = ON`.

**`auth`** se arma así:
```js
{ requireRole: (...roles) => middlewareDeGianny(...roles), // 401 sin sesión, 403 con otro rol
  getActor: (req) => ({ userId: req.user.id, role: req.user.role }) }
```

**Seed:** ejecutar `runMartinSeed({ db, hashPassword, driverPassword })` **después** del seed de catálogo. Busca los recorridos por código de línea y sentido, y es idempotente.

- **Express 4 y 5:** compatible; probado con el Express 5 del repo.
- **Errores:** cada router responde con el formato del contrato `{ error: { code, message, details } }`.

### Endpoints (`/api/v1`)

| Ruta | Acceso |
|---|---|
| `GET /vehicles/active?lineId=` | Público |
| `GET /driver/shifts` | Conductor |
| `POST /driver/shifts/:id/start` · `/finish` | Conductor |
| `POST /driver/shift-trips/:id/start` | Conductor |
| `POST /driver/trips/:id/locations` · `/finish` | Conductor |
| `GET /driver/trips/:id/stop-alerts` | Conductor |
| `POST /driver/alert-events/:id/seen` | Conductor |
| `GET /admin/drivers` · `/admin/vehicles` · `/admin/shifts` | Administrador |
| `POST /admin/shifts` · `PATCH /admin/shifts/:id` | Administrador |

### Tablas

| Acceso | Tablas |
|---|---|
| Lectura | `users`, `lines`, `routes`, `route_stops`, `stops` |
| Escritura | `vehicles` (seed), `shifts`, `shift_trips`, `trips`, `trip_stops`, `trip_locations`, `driver_alert_events`, `driver_alert_deliveries` |
| Compartidas con Gianny | `stop_requests` (`sent → next → closed`), `trip_links` (`ended_at` al finalizar el viaje) |

Solo Martín escribe `trips.last_passed_sequence`.

## 2. Frontend (`frontendmobile`)

1. **Dependencias:** `npx expo install react-native-maps expo-location expo-audio expo-keep-awake`.
2. **Permiso de ubicación en `app.json`:** plugin `["expo-location", { "locationWhenInUsePermission": "VoyBus usa tu ubicación para mostrar la posición del bus mientras conduces un viaje." }]`.
3. **Raíz (`src/app/_layout.tsx`):**
   ```tsx
   import { createMartinApi, MartinApiProvider } from '@/features/martin-index'; // o ruta relativa
   const api = createMartinApi({ baseUrl: API_URL, getToken: obtenerTokenDeLaSesion });
   <MartinApiProvider api={api}>{/* Stack / Tabs */}</MartinApiProvider>
   ```
4. **Rutas:** archivos de una línea en `src/app`, por ejemplo `export { DriverShiftsScreen as default } from '../features/martin-index';`.

   | Ruta | Pantalla | Acceso |
   |---|---|---|
   | `vehicles` | `ActiveVehiclesScreen` | Público |
   | `driver/index` | `DriverShiftsScreen` | Conductor |
   | `driver/trip/[tripId]` | `DriverTripScreen` | Conductor |
   | `admin/index` | `AdminShiftsScreen` | Administrador |
   | `admin/shift` | `ShiftFormScreen` | Administrador (`?shiftId=` para editar) |

   Si las rutas son otras, basta con cambiar `martin-common/routes.js`.
5. **Dependencia del catálogo:** la pantalla de vehículos y el formulario de turnos usan los endpoints públicos de Gianny `GET /lines`, `/lines/:id/routes` y `/routes/:id`.
6. **Versión de Expo:** la base es **SDK 57**. Se verificó que las pantallas compilan en `frontendmobile` (bundle Android) con:
   - `react-native-maps@1.27.2`
   - `expo-location@~57.0.23`
   - `expo-audio@~57.0.5`
   - `expo-keep-awake@~57.0.2`

   Si Expo Go en el teléfono pide SDK 58, actualizar con `npx expo install expo@^58.0.0 --fix`.

## 3. Pruebas

```bash
cd backend
npm install
npm test          # node --test "test/**/*.test.js" — requiere Node.js >= 22.13 (node:sqlite)
```

- **Resultado:** 35/35 pruebas aprobadas, positivas y negativas. El detalle está en `PRUEBAS.md`.
- **GPS simulado para la demo**, con el servidor integrado y el seed cargado:
  ```bash
  npm run simulate:gps -- --drivers=2,3,4 --speed=20
  ```

## 4. Checklist de integración en `dev`

- [ ] `schema.sql` aplicado una vez y `foreign_keys = ON`.
- [ ] Seed de Gianny y luego `runMartinSeed`.
- [ ] `createMartinRouter` montado en `/api/v1`.
- [ ] Rutas Expo y `MartinApiProvider` en la raíz.
- [ ] Dependencias instaladas con `npx expo install` y probadas en el teléfono.
- [ ] Flujo completo:
  1. el administrador crea un turno;
  2. el conductor inicia turno y viaje (GPS);
  3. el vehículo es visible al pasajero;
  4. el pasajero se vincula y solicita una parada;
  5. el conductor recibe la alerta con contador;
  6. la solicitud pasa a `next` y luego a `closed` (`stop_passed`), o se cierra por fin de viaje (`trip_finished`).
