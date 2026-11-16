# Matriz de trazabilidad y pruebas — Entrega 2

**Importante:** nueve requerimientos seleccionados, pero ninguno se considera completado hasta probar **todas** sus condiciones. Esta matriz transforma la ERS inicial en evidencias concretas. Completar con estado real, captura/video, commit y responsable cuando se implemente.

| Responsable | ERS | Condiciones que demostrar | Pruebas mínimas |
|---|---|---|---|
| Gianny | RED-01 líneas/recorridos | Público sin sesión; al menos 3 líneas seed; código/nombre/color/inicio/fin/estado; búsqueda por nombre/código; elegir línea y sentido; horarios, mapa y paraderos ordenados; desactivadas ocultas, suspendidas con aviso; estados de error/vacío | Buscar existente e inexistente, ver 3 líneas, cambiar sentido y comprobar orden/geometría, deshabilitar/suspender línea en datos demo, simular API caída |
| Gianny | RED-02 paraderos | Público sin sesión; 10 paraderos seed; código/nombre/ubicación/líneas/sentidos; búsqueda; salto a recorrido; registrados guardan/quitan favoritos persistentes | Buscar por código/nombre, elegir desde mapa y ruta, iniciar sesión demo, añadir/quitar favorito, cerrar y volver a entrar |
| Martín | RED-02 duplicado: vehículos | Público sin sesión; 10 vehículos seed; filtrar por línea; solo viajes activos; mostrar identificador, línea/recorrido, sentido, última posición y hora; actualización automática; ocultar finalizados | Ver vehículo activo, mover ubicación desde otro dispositivo, esperar actualización sin recargar, terminar viaje y confirmar desaparición |
| Gianny | VIA-01 | Registrado/invitado; QR y código manual; confirmar vehículo, línea, sentido; un solo viaje a la vez; impedir código inválido o sin viaje; desvincular/finalizar | Escanear QR, ingresar código, vincular, intentar segundo vínculo, liberar vínculo, probar inválido e inactivo |
| Gianny | VIA-02 | Ver futuros con código/nombre/orden; seleccionar destino y enviarlo; no permitir ya superados; una pendiente por pasajero y viaje; solicitudes mismo paradero agrupadas para conductor, pero registros individuales conservados | Elegir futuro, enviar y ver confirmación persistida, repetir petición, elegir pasado, dos pasajeros seleccionan mismo paradero y conductor ve contador 2 |
| Gianny | VIA-03 | Estado automático `sent`, `next`, `closed`; destino, cierre y motivo; no declarar atendida por cercanía; perder GPS y conservar último estado + aviso de atraso | Mostrar `sent` y transición a `next` y `closed`, cierre por fin de viaje, desactivar GPS y validar indicador sin inventar atención |
| Martín | VEH-01 | Consultar asignación; ver vehículo/línea/recorrido/sentido/horario; iniciar y terminar viaje registrando horas; GPS al iniciar y cesar al finalizar; impedir dos viajes; permiso obligatorio; ubicación atrasada si GPS cae | Conductor inicia y finaliza, ver GPS actualizar pasajero, probar permiso denegado, intentar segundo viaje, simular pérdida GPS |
| Martín | VEH-02 | Aviso visual/sonoro automático; nombre/conteo; orden del recorrido; no bloquear viaje ni exigir confirmación; retirar pasados; contador actualizado; reconexión sin alertas repetidas | Dos solicitudes mismo paradero, contador 2 sin segunda alerta, probar orden y paradero superado, reconectar y no repetir sonido |
| Martín | ADM-03 | Crear/modificar turnos con conductor/vehículo/fecha-horas; viajes en orden con línea/ruta/sentido; asignación visible al conductor; evitar solapamientos; solo conductor habilitado y vehículo operativo; tolerancia configurable | Crear turno y verificar en conductor, editar, rechazar turno superpuesto, conductor deshabilitado/vehículo fuera de servicio, editar tolerancia |

## Casos integrados que no pueden faltar

1. Administrador crea turno con viaje planificado -> conductor lo ve -> inicia turno y viaje -> vehículo se muestra al pasajero.
2. Pasajero sin cuenta consulta línea/recorrido/paradero -> se vincula por QR/código -> selecciona paradero futuro -> emite solicitud.
3. Dos pasajeros solicitan mismo destino -> se almacenan **dos solicitudes** -> conductor ve **un aviso agrupado con contador 2**.
4. Conductor avanza de forma confiable -> estado pasa a `next` -> al superar parada pasa a `closed` por `stop_passed` -> no se afirma que se detuvo.
5. GPS deja de actualizar -> se muestra última lectura con hora y advertencia; sin avanzar paraderos ni finalizar automáticamente.
6. Conductor termina viaje -> se cierran pendientes por `trip_finished`, se cancelan vínculos y el vehículo deja de figurar en los vehículos activos.
7. Usuario registrado guarda favorito -> lo recupera en otra sesión. Invitado intenta hacerlo -> acceso prohibido.
8. Código QR inválido / viaje inexistente / solicitud duplicada / parada ya superada -> mensajes comprensibles, sin crash.

## Evidencias para la rúbrica

- Video: mencionar cada ID y nombre antes de demostrarlo. Distinguir el ID duplicado con el nombre completo hasta que el docente lo aclare.
- Git: commits y PR por integrante, versión presentada (`main` commit SHA), instrucciones de ejecución y seed reproducible.
- Diagramas: esquema relacional actualizado y cómo cada tabla sustenta los nueve requerimientos.
- Presentación: tabla de estado por los **seis módulos totales** de la ERS, no solo por los módulos seleccionados.
- Registro de pruebas: `testId`, ERS, escenario, precondición, resultado esperado, resultado observado, evidencia, commit, responsable.

Los datos del seed pueden ser ficticios para demostración, siempre que estén rotulados como tal y permitan reproducir las validaciones. El uso de coordenadas o datos de recorrido reales requiere verificación separada; no atribuir un recorrido ficticio a servicios reales.
