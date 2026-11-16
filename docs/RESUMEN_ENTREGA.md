# Resumen del alcance de Gianny — VoyBus Entrega 2

## Implementado en este paquete

- RED-01: catálogo público, búsqueda, filtro de líneas inactivas, avisos de suspensión, ambos sentidos, geometría y paraderos ordenados.
- RED-02 (paraderos): catálogo público de 12 paraderos ficticios, búsqueda, mapa, líneas/sentidos, favoritos persistentes para pasajeros registrados.
- VIA-01: acceso pasajero/invitado, QR `voybus://vehicle/<code>`, código manual, confirmación de viaje/recorrido, un vínculo activo por identidad.
- VIA-02: paraderos futuros de un viaje, selección, validación de superado, una solicitud pendiente, idempotencia, eventos de alerta agrupables sin duplicar registros.
- VIA-03: consulta automática cada 5 s, `sent`, `next`, `closed`, causas del cierre y alerta por GPS sin actualizar.
- Autenticación compartida: login para cuentas demo, invitado, revocación y middleware por rol.
- SQLite: el esquema v1.1 original de 18 tablas, sin modificaciones.

## No incluido (propiedad de Martín)

- RED-02 duplicado: visualización y actualización automática de vehículos activos.
- VEH-01: control real de viajes y ubicación GPS.
- VEH-02: pantallas de alertas visuales/sonoras al conductor y conteos en su interfaz.
- ADM-03: creación y modificación operativa de turnos.

`demo-trip.js` y `demo-progress.js` solo proveen datos de simulación para pruebas aisladas. No deben sustituir los módulos operativos de Martín.

## Comprobaciones realizadas en el entorno de generación

- Ocho pruebas automáticas de servicios: aprobadas (Node 22 + SQLite integrada).
- Inicialización y seed SQLite, generación de viaje demo, avance y cierre simulado: correctos.
- Validación sintáctica de 17 archivos TypeScript/TSX mediante TypeScript: sin errores sintácticos.
- Pruebas con Express y Expo instalados: pendientes, porque en el entorno no se pudieron descargar paquetes npm.
- Cámara, Expo Go Android/iOS y GPS real: pendientes de validación en dispositivos.

## Referencias técnicas revisadas

- Expo SDK 58 (`expo` 58), React Native 0.88, React 19.3.
- Expo Router, Expo Camera, SecureStore, Expo Crypto, React Native Maps.
- Compatibilidad de bibliotecas: confirmar con `npx expo install --check` tras instalar dependencias.

## Evidencias importantes para la rúbrica

La segunda entrega evalúa nueve requerimientos de ambos integrantes. Este ZIP cubre solo cinco, por lo que no se puede presentar todavía como entrega final del equipo. Luego de integrar, registrar el commit, la prueba real, la captura y el segmento de video de cada requerimiento.
