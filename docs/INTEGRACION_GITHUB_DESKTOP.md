# VoyBus — Integración desde GitHub Desktop (GiannyParedes)

## Alcance
Este ZIP es un **snapshot de integración**, no un repositorio Git. Conserva
`backend/`, `frontendmobile/` y `docs/`, como la rama `dev` de Martín.
No contiene `.git`, `.env`, bases SQLite personales ni `node_modules`.

## Copiar a la rama
1. En GitHub Desktop confirmar `Current Branch: GiannyParedes` y `Push origin` si hay commits no publicados.
2. Crear una copia de seguridad de la carpeta clonada del repositorio.
3. Cerrar los servidores Metro y Express.
4. Copiar **contenido** de `backend/`, `frontendmobile/` y `docs/` de este ZIP a los mismos directorios
   del repositorio clonado, aceptando reemplazos. No copiar una carpeta VoyBus contenedora extra.
5. Este ZIP parte de los archivos de Martín y añade módulos de Gianny; los archivos de Martín bajo
   `backend/src/modules`, `backend/src/seeds`, `backend/test/martin` y `frontendmobile/src/features`
   permanecen presentes. **No borres el directorio `.git` del clon.**
6. Eliminar o regenerar `backend/package-lock.json` y `frontendmobile/package-lock.json` preexistentes,
   puesto que Martín trabajaba con Expo 57 y esta versión utiliza Expo 58.
7. Mantener o crear `.env` de frontend con `EXPO_PUBLIC_API_URL=http://IP_PC:3000`.
   Nunca guardar archivos `.env` con secretos en Git.
8. Ejecutar las pruebas y la aplicación. Hacer commit solo cuando la revisión sea satisfactoria.

## Backend Windows PowerShell
```powershell
cd backend
npm.cmd install
npm.cmd run db:init
npm.cmd run db:seed
npm.cmd run db:seed:martin
npm.cmd run check
npm.cmd start
```
Usar la carpeta y BD existente del clon para ejecutar los seeds. No borrar la BD de un equipo
sin antes hacer una copia; para una demo limpia, usar una BD nueva en ubicación aparte.

### Usuarios de prueba
- `pasajero@voybus.local` / `VoyBus2026!`
- `admin@voybus.local` / `VoyBus2026!`
- `conductor1.demo@voybus.local` / `VoyBus2026!` (sembrado por Martín)

## Frontend Windows PowerShell
```powershell
cd frontendmobile
npm.cmd install
npx.cmd expo install --check
npm.cmd run check
npx.cmd expo start --clear
```
El teléfono y PC deben alcanzar la misma dirección de red local.
Expo Router usa `frontendmobile/src/app/`, no crea una segunda carpeta `app` raíz.

## Funciones a ensayar en Android
- Pasajero: búsqueda de líneas/paraderos, favoritos, QR, parada y estados.
- Público: mapa de vehículos activos (de Martín).
- Conductor: login, turno, viaje, ubicación GPS y avisos.
- Admin: login, crear/editar turnos con validaciones.
- Integración: solicitud de pasajero visible al conductor y cerrada tras superar paradero.

**El QR de desarrollo `VB-010` sigue disponible solo con el viaje DEMO iniciado.**

## GitHub Desktop
1. En `Changes`, revisar que solo haya archivos esperados; comprobar `.gitignore`.
2. Commit recomendado: `feat: integrate passenger workflows into shared VoyBus application`.
3. `Push origin` desde `GiannyParedes`.
4. Crear PR con base `dev`, compare `GiannyParedes`.
5. Revisar CI/pruebas y resolver observaciones antes del merge.
