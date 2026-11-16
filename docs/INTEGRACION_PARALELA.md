# Procedimiento de desarrollo en paralelo e integración — VoyBus v1.1

## Alcance y propiedad (no duplicar)

| Entregable | Responsable final | Consumidor |
| --- | --- | --- |
| `auth`, sesiones invitado, roles y middleware | Gianny | Martín |
| Base SQLite `schema.sql`, conexión y migración inicial | Gianny | Martín |
| Seed de líneas, rutas y paraderos (3 líneas, >=10 paraderos) | Gianny | Martín |
| Seed complementario de vehículos (>=10), conductores y turnos | Martín | Gianny |
| Endpoints RED-01, paraderos, vinculación y solicitudes | Gianny | Martín |
| Endpoints vehículos activos, GPS, alertas y turnos | Martín | Gianny |
| Entrada final del servidor Express (`app`, `server`, registro central de routers) | Gianny | Martín exporta routers |
| Navegación final, tema y estructura raíz de la app Expo | Gianny | Martín exporta pantallas/componentes |
| Pruebas integradas de los nueve requisitos | Ambos | Ambos |

**Nota:** que Gianny sea responsable de configurar la API final no significa que deba escribir la lógica del conductor de Martín.

## GitHub desde cero: forma viable

1. Crear **un repositorio frontend y uno backend** (o respetar los repositorios ya creados) con un mínimo `README.md` en `main`. Ese primer commit es la base común de Git.
2. Crear `dev`, `GiannyParedes` y `MartinSolari` **desde el mismo commit**. No hace falta tener una app inicial común.
3. Gianny sube sus archivos a su rama; Martín sube los suyos a su rama. Mantienen commits propios y convencionales.
4. **Riesgo real:** si ambos crean `package.json`, `app.json`, `app/`, `src/app.js`, `src/server.js`, `database/schema.sql` o la configuración de autenticación, Git generará conflictos o uno podría sobrescribir al otro. Para reducirlos, Martín debe encapsular su implementación y sus demostradores temporales bajo rutas propias, evitando editar archivos compartidos finales.
5. En la integración de `dev` se incorporan los módulos de Martín y su seed adicional en los puntos de entrada definitivos de Gianny. El código temporal de arranque de Martín no sustituye la app ni el servidor compartidos.
6. Nadie fuerza commits ni resuelve conflictos con «aceptar todo» sin comparar cambios. Revisar PR, ejecutar tests y dejar evidencias.

### Organización sugerida para los módulos que entrega Martín

```text
backend/
  src/modules/vehicles/    # RED-02 vehículos (Martín)
  src/modules/driver/      # VEH-01 y VEH-02
  src/modules/admin/       # ADM-03
  src/seeds/martinSeed.js  # semilla complementaria, reutiliza datos del catálogo
frontend/
  src/features/vehicles/   # lista/mapa vehículos
  src/features/driver/     # pantallas del conductor
  src/features/admin/      # pantallas de administración
```

Gianny integra estos módulos en `app`/Expo Router y en el router Express principal. Los módulos de Martín deben exponer routers y pantallas, no generar un segundo backend final. Si Martín requiere una app de prueba completa, ubicarla en una carpeta **temporal separada** (por ejemplo `martin-demo/`) y documentar qué partes no deben fusionarse.

## Bibliotecas y configuración

- Cliente final: Expo + React Native + **Expo Router** para navegación; `react-native-maps` para mapas; `expo-location` para posición del conductor; `expo-camera` para QR de pasajero; `expo-secure-store` para tokens. Ambos deben usar **el mismo SDK Expo** y versiones compatibles instaladas por `npx expo install`; no fijar independientemente versiones incompatibles.
- Backend final: Node.js + Express + SQLite; abrir SQLite con claves foráneas habilitadas. Se usa el mismo mecanismo de acceso a base que implemente Gianny, no dos librerías/instancias incongruentes.
- Contrato: `/api/v1`, JSON `camelCase`, tablas `snake_case`, instantes UTC ISO 8601, autorización Bearer y formato de errores documentado.
- Datos en tránsito: actualizaciones automáticas aproximadamente cada 5 s solo en vistas activas; si no hay lectura GPS válida por 30 s, la ubicación se marca atrasada. El progreso no avanza por cercanía aislada ni sin señal.
- No subir claves reales, bases personales `.db`, `.env` con secretos ni `node_modules`.

## Integración posterior — lista de verificación

1. `schema.sql` se ejecuta una sola vez y `PRAGMA foreign_keys=ON` aplica a toda conexión.
2. El seed de Gianny carga catálogo y usuarios demo; el de Martín agrega sus vehículos, conductores y turnos sin borrar los datos existentes. Resolver IDs por `code`, no asumir numeraciones fijas.
3. Montar los routers Express de Martín sobre `/api/v1`, sin duplicar autenticación; usar middleware compartido para `driver` y `admin`.
4. Incorporar pantallas del conductor, administración y vehículos activos a la navegación final, respetando paleta y APIs.
5. Unificar `package.json` y `app.json`, instalar dependencias en un solo proyecto, verificar permisos y conexión por IP local a la API.
6. Flujo final: admin asigna turno → conductor inicia viaje → GPS visible → pasajero vincula QR → solicita parada → conductor ve alerta → cierre automático al superar parada o terminar viaje.
7. Verificar errores de acceso, duplicados, solapamientos, caídas de red y GPS, persistencia y no repetición de alertas.
8. Registrar SHA, commits y evidencias de ambos integrantes, más versiones SDK y Node usadas.

## Reglas de cambio

Solo se permite adaptar código **al contrato**, no al revés. Si el contrato presenta un defecto crítico, abrir una propuesta concreta (campos/endpoints afectados, motivo, impacto) y aprobarla con ambos integrantes; crear una revisión v1.2 antes de codificar cambios incompatibles. El identificador RED-02 duplicado en la ERS se sigue distinguiendo por nombre hasta que el profesor lo aclare.
