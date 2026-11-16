# VoyBus — versión integrada para la rama GiannyParedes

Proyecto combinado **sin fusionar historiales Git**. Este paquete está diseñado para copiarse
sobre el clon de `VoyBus` en la rama `GiannyParedes` después de incorporar los commits de `dev`.

- `backend/`: servidor Express único: autenticación + RED-01, RED-02(paraderos), VIA-01/02/03 de Gianny;
  rutas de RED-02(vehículos), VEH-01, VEH-02 y ADM-03 de Martín.
- `frontendmobile/`: una aplicación Expo Router SDK58 con pantallas de ambos equipos.
- `docs/INTEGRACION_GITHUB_DESKTOP.md`: instrucciones detalladas.

Se conservaron los contratos SQLite/API existentes. Se agregó un `db:seed:martin` para
cargar los datos de conductor. El token de sesión es único y los permisos se validan en el backend.

**Estado de validación:** integración de servicios verificable mediante `tests/integration.test.js`.
No implica que la ejecución final de las pantallas GPS/audio en el teléfono ya esté validada.

**Antes de copiar al repositorio, haz una copia de seguridad de la carpeta clonada.**
