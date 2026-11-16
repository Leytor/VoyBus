import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { confirmAction } from '../martin-common/ui';

/**
 * VEH-01: el conductor debe habilitar la ubicacion para iniciar un viaje.
 * Devuelve true si el permiso esta concedido; si no, explica como habilitarlo.
 */
export async function ensureLocationPermission() {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  const requested = current.canAskAgain ? await Location.requestForegroundPermissionsAsync() : current;
  if (requested.granted) return true;

  const openSettings = await confirmAction(
    'Ubicación desactivada',
    'Para iniciar el viaje debes permitir que VoyBus use la ubicación del teléfono. ¿Abrir la configuración?',
  );
  if (openSettings && Platform.OS !== 'web') await Linking.openSettings();
  return false;
}
