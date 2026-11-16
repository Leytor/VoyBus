# Cambios — v1.1 (Gianny)

## Problema detectado en Android

El mapa mostraba una diagonal artificial: los paraderos estaban generados mediante incrementos constantes de latitud/longitud. El frontend dibujaba correctamente esos datos, pero las ubicaciones no eran suficientemente realistas.

## Corrección realizada

1. Se conservaron IDs y códigos de paraderos, líneas, rutas, cuentas, endpoints, contrato API y esquema SQLite.
2. Se ubicaron los doce puntos DEMO sobre un corredor geográfico real de Antofagasta, con referencias de OpenStreetMap/Mapcarta.
3. Los ocho recorridos DEMO se dibujan utilizando las coordenadas de los paraderos en su secuencia.
4. Se incluyó un comando seguro de actualización de la base existente y respaldo previo.
5. Se incorporaron dos pruebas automatizadas de consistencia y migración.

**Limitación:** los segmentos entre paraderos son aproximaciones, no una ruta vial certificada ni rutas oficiales. Véase `FUENTES_Y_LIMITACIONES_MAPA.md`.

## Cómo aplicar en Windows sin perder datos

1. Extraer el ZIP **v1.1**. Para conservar tus archivos `.env` y datos existentes, reemplaza los archivos fuente correspondientes; no borres tu carpeta `voybus-backend/data/` ni tus archivos `.env`.
2. Detener Express (`Ctrl+C`) y dejar el frontend Expo abierto o detenido.
3. Desde `voybus-backend`, si el viaje DEMO anterior sigue activo, ejecutar: `node scripts/demo-progress.js finish`.
4. Ejecutar `npm.cmd run db:map:update`.
5. Confirmar la salida `Mapa actualizado: 12 paraderos y 8 recorridos DEMO` y la ubicación de la copia de seguridad.
6. Ejecutar `npm.cmd run check` (deben pasar **10 pruebas**).
7. Ejecutar `npm.cmd run demo:trip` y luego `npm.cmd start`.
8. Entrar a Líneas y Paraderos en Expo Go para cargar las nuevas ubicaciones.

No es necesario volver a instalar dependencias, regenerar Expo, eliminar SQLite, ni cambiar la IP del `.env`. Si ya ejecutaste el actualizador, informa que no hay cambios y no crea otro backup.

**Importante:** primero termina el viaje activo. Un viaje iniciado antes del cambio conserva el snapshot de coordenadas de ese momento.
