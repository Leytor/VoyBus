# Pruebas manuales y evidencia para la Entrega 2 — Gianny

La rúbrica exige requisitos completos y trazables. Los ocho casos automatizados del backend **no** sustituyen estos recorridos de prueba en Expo Go.

| ID ERS | Escenario que debe mostrarse | Evidencia requerida |
|---|---|---|
| RED-01 | Consultar 3 líneas sin cuenta, buscar por nombre/código; comprobar ida/regreso, horarios, geometría y orden; ver línea suspendida y omitir la deshabilitada | Video de listado, mapa y cambio de sentido |
| RED-01 | Buscar término inexistente; detener backend y volver a activar | Estados vacío y error, sin cierre inesperado de app |
| RED-02 | Listado 12 paraderos, buscar por nombre y código, abrir mapa, saltar a recorrido | Video de navegación y consulta |
| RED-02 | Iniciar sesión de pasajero, guardar favorito, cerrar sesión, entrar nuevamente, eliminar | Persistencia real en SQLite entre sesiones |
| VIA-01 | Probar QR `voybus://vehicle/VB-010` e ingreso manual; confirmar línea y sentido | Escaneo cámara real e ingreso manual |
| VIA-01 | Código inválido, vehículo sin viaje activo, intento de segundo vínculo (mismo pasajero) | Mensajes 404/409, no se crea vínculo inválido |
| VIA-02 | Elegir parada futura, enviar y comprobar respuesta persistente; intentar duplicado | Una solicitud pendiente por pasajero |
| VIA-02 | Solicitudes de dos sesiones distintas para el mismo paradero | Dos filas `stop_requests`; un `driver_alert_event` compartido (Martín mostrará el contador) |
| VIA-02 | Avanzar a una secuencia superada e intentar enviar una solicitud a ese destino | Error `STOP_ALREADY_PASSED` |
| VIA-03 | Ver `sent`, avanzar a `next`, avanzar al paradero y ver `closed` con razón `stop_passed` | Pantalla actualiza sin presionar recargar |
| VIA-03 | Finalizar viaje antes de la parada, ver razón `trip_finished` | No se informa detención ni bajada confirmada |
| VIA-03 | Simular ubicación antigua y/o desconectar servidor | Conserva último estado y avisa que está atrasado |

### Resultado de pruebas de código en entorno de generación

- `node --test tests/*.test.js`: 8 pruebas superadas.
- Comprobados los scripts `db:init`, `db:seed`, `demo:trip` y `demo-progress.js` sobre archivo SQLite temporal.
- Verificada sintaxis de los archivos TypeScript/TSX mediante el compilador de TypeScript sin dependencias nativas.
- **No realizadas aquí:** `npm install`, compilación completa de Expo, pruebas HTTP con Express real, cámara real, GPS real, funcionamiento en Android/iOS y pruebas integradas con Martín. Todos esos resultados deben anotarse tras ejecutarlos en el computador/dispositivo del equipo.

### Video de entrega

Antes de cada flujo indicar el ID de la ERS. No presentar el cambio simulado de `demo-progress.js` como prueba del GPS de Martín. Se debe diferenciar claramente el fixture local de la integración real del equipo.
