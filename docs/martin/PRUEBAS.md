# Pruebas de los módulos de Martín

```bash
cd backend && npm install && npm test
```

**Requisito:** Node.js 22.13 o superior, por `node:sqlite`. Cada prueba crea una base SQLite **en memoria** con:
- la copia idéntica de `schema.sql` v1.1 (se verifica su hash);
- un catálogo de prueba;
- el seed de Martín;
- un reloj controlable, para probar el GPS atrasado y la tolerancia.

La autenticación de `backend/test/martin/support/` es un doble de prueba; la app usa la de Gianny.

**Resultado (15-11-2026, Node 24.15, Express 5):** 35 pruebas, 35 aprobadas, 0 fallidas.

| Archivo | Requerimiento | Casos |
|---|---|---|
| `backend/test/martin/vehicles.test.js` | Visualización de vehículos | ≥ 10 vehículos en el seed; acceso público; solo viajes activos con posición; filtro por línea; finalizados ocultos; actualización de la posición; atraso > 30 s conservando la última posición; `lineId` inválido (400) |
| `backend/test/martin/veh01-trips.test.js` | VEH-01 | Asignación visible; 401/403; viaje sin turno iniciado; hora real e instantánea de paraderos; dos viajes simultáneos; conductor ajeno; vehículo fuera de servicio; validación GPS (formato, precisión, antigüedad, JSON mal formado); avance monótono sin lectura aislada; salto imposible; lectura desordenada; reintento idempotente; pérdida de GPS sin cerrar el viaje; fin de viaje (cierra solicitudes y vínculos, no el turno); no cerrar el turno con un viaje activo |
| `backend/test/martin/veh02-alerts.test.js` | VEH-02 | Agrupación con contador y orden del recorrido; un solo evento sonoro por paradero; contador sin nueva alerta; reconexión sin repetir; paradero superado retirado y `stop_passed`; transición `sent → next`; permisos; viaje finalizado |
| `backend/test/martin/adm03-shifts.test.js` | ADM-03 | 401/403; disponibilidad de conductores y vehículos; crear y verlo como conductor; solapamiento por conductor y por vehículo; turnos contiguos válidos; conductor deshabilitado; vehículo en mantenimiento o fuera de servicio; operativo con observaciones permitido; horario de viajes (fuera del turno, orden duplicado, superposición, formato); edición de tolerancia y horarios; conflicto al editar; cancelación; turno en curso no editable; tolerancia → atraso |
| `backend/test/martin/contract-and-seed.test.js` | Contrato y seed | Hash de `schema.sql`; seed idempotente que no borra el catálogo; error claro sin catálogo; avance sin geometría y fuera de ruta |

## Verificación manual previa a la integración

Se hizo con un entorno temporal de Martín, que no está en el repo: la versión web de la app, un servidor de prueba y el GPS simulado.

**Verificado:**
- **ADM-03:** se rechaza un turno superpuesto; se crea uno válido y el conductor lo ve.
- **VEH-01:** el turno pasa a "en curso" con el atraso calculado; el viaje no inicia sin permiso de ubicación.
- **VEH-02:** contador por paradero; aviso solo para el paradero nuevo y sin repetir.
- **Vehículos:** se ven sin sesión, con filtro por línea, detalle completo, actualización automática y "ubicación atrasada" cuando corresponde.

**Pendiente de probar en un teléfono real:** el GPS del dispositivo, el mapa (`react-native-maps`) y el sonido de la alerta.
