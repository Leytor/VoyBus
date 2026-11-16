# VoyBus — Geografía demostrativa v1.1

## Propósito y límites

La primera versión ubicaba los doce paraderos mediante una fórmula diagonal en `scripts/seed.js`. Esta revisión conserva las claves `P001` a `P012`, los nombres «Paradero demostración N» y los IDs de las líneas y recorridos; actualiza únicamente sus coordenadas y la geometría JSON de las ocho rutas DEMO.

**No son rutas de transporte público oficial ni itinerarios georreferenciados con ajuste completo a la calzada.** Las coordenadas empleadas corresponden a ubicaciones identificadas como paradas de autobús en OpenStreetMap, consultadas a través de Mapcarta; las líneas DEMO enlazan esos puntos por segmentos consecutivos. El recorrido resultante es una **aproximación visual del corredor avenida Argentina**. La API y la aplicación no incluyen un motor de enrutamiento ni cálculo de calles o sentido de circulación.

Los nombres de parada que aparecen en la app siguen siendo genéricos por compatibilidad con las pruebas anteriores; se incluye la referencia real utilizada solo para explicar la geografía.

## Referencias de las 12 ubicaciones

| ID demo | Referencia geográfica | Coordenadas (latitud, longitud) | Fuente |
|---|---|---|---|
| P001 | Copiapó / Avenida Argentina | -23.65861, -70.39653 | https://mapcarta.com/es/N7668083452 |
| P002 | Argentina / Salvador Reyes | -23.65962, -70.39622 | https://mapcarta.com/es/N7668083463 |
| P003 | General Velásquez / Av. Argentina | -23.66063, -70.39722 | https://mapcarta.com/es/N7668083967 |
| P004 | Argentina / Antonio Toro | -23.66344, -70.39730 | https://mapcarta.com/es/N7668083958 |
| P005 | Avenida Argentina / Chillán | -23.67029, -70.39960 | https://mapcarta.com/es/N7668083590 |
| P006 | Avenida Argentina / Concepción | -23.67253, -70.40074 | https://mapcarta.com/es/N7668083820 |
| P007 | Argentina / Homero Ávila | -23.67398, -70.40198 | https://mapcarta.com/es/N7668083527 |
| P008 | Argentina / Nicanor Plaza | -23.67485, -70.40275 | https://mapcarta.com/es/N7668083761 |
| P009 | Av. Argentina / Enrique Soro | -23.67804, -70.40555 | https://mapcarta.com/es/N7668083532 |
| P010 | Avenida Argentina / Altos del Mar | -23.68240, -70.40907 | https://mapcarta.com/es/N7668083946 |
| P011 | Avenida Argentina / Trumao | -23.68558, -70.40973 | https://mapcarta.com/es/N7668083653 |
| P012 | Argentina / Máfil | -23.69020, -70.41018 | https://mapcarta.com/es/N7668083902 |

**Origen:** datos de ubicación referenciados por OpenStreetMap (ODbL; consultar https://www.openstreetmap.org/copyright). Consultados en noviembre de 2026. Los trazados sintéticos DEMO fueron preparados para una demostración académica y no autorizan a afirmar que el transporte público circula por esas rutas.

## Impacto técnico

- Esquema SQL de 18 tablas y contrato HTTP **sin modificaciones**.
- Reglas de validación, IDs de paraderos, estados de viajes, favoritos y solicitudes **sin modificaciones**.
- `npm.cmd run db:seed` carga la nueva geografía **solo para bases nuevas** (`INSERT OR IGNORE`).
- `npm.cmd run db:map:update` actualiza la **base existente**, de forma transaccional, solo si mantiene los códigos y nombres DEMO originales.
- El actualizador requiere no tener viajes activos, hace copia de seguridad mediante `VACUUM INTO` y **no modifica** `trip_stops`, `trip_locations`, `trip_links` ni `stop_requests`. Los snapshots de viajes anteriores siguen siendo históricamente consistentes.
- Tras la actualización, inicia un viaje DEMO nuevo (`npm.cmd run demo:trip`) si deseas volver a probar con ubicaciones actualizadas.
- **Para ajustar rutas con precisión a calles reales:** importar geometrías validadas de la red vial y conectividad/sentidos a través de un servicio de enrutamiento o GIS. No es parte de esta actualización.
