# Ajuste del frontend integrado (v1.1)

## Motivo
La rama original de Martin incluia una plantilla Expo generada por defecto. Al copiar el ZIP integrado sobre una rama Git existente, Windows **no elimina los archivos que ya existian**. TypeScript encontro 35 errores procedentes de archivos viejos no usados (`explore.tsx`, `animated-icon`, `app-tabs`, `theme`, etc.).

## Instalacion en GitHub Desktop / Windows

1. Selecciona `GiannyParedes` en GitHub Desktop, y guarda una copia de seguridad de tu carpeta clonada.
2. Descomprime este ZIP en una carpeta temporal.
3. Copia al clon las carpetas `backend`, `frontendmobile` y `docs` del ZIP, aceptando reemplazar los archivos existentes. **No borres `.git`, `.env`, `node_modules` ni la base SQLite local.**
4. Copia tambien `limpiar_plantilla_expo.cmd` a la raiz del repositorio clonado.
5. Desde el Explorador de Windows, haz doble clic en el CMD (o ejecútalo desde PowerShell con `./limpiar_plantilla_expo.cmd`). El CMD solamente elimina archivos obsoletos enumerados en el script; no elimina modulos propios del proyecto.
6. Comprueba que `frontendmobile/tsconfig.json` no contenga `baseUrl` y que `paths` apunte a `./src/*`.
7. Abre una terminal de PowerShell dentro de `frontendmobile` y ejecuta:
   ```powershell
   npm.cmd run check
   npx.cmd expo start --clear
   ```
8. Prueba en Android y revisa los cambios de GitHub Desktop antes de hacer commit.

## Cambios concretos
- Eliminados `explore.tsx` y los componentes de la plantilla Expo que nadie importa desde las pantallas vigentes de VoyBus.
- `tsconfig.json` corregido: sin `baseUrl` (obsoleto en TS6), alias `@/` apuntando a `src`.
- Sin cambios en los contratos API, el esquema SQLite, los modulos de Martin ni el backend.

## Limites de la validacion
Se comprobaron importaciones y estructura localmente. Este entorno no tiene las dependencias `node_modules` de Android; `npm.cmd run check` y la ejecucion en Expo Go deben validarse en tu equipo. Los 46 tests del backend que compartiste no se ven afectados por esta correccion.
