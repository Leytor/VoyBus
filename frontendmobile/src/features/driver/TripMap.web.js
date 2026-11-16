import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../martin-common/theme';
import { coordinates } from '../martin-common/format';

/** En la web (solo pruebas) el mapa se reemplaza por un resumen. */
export default function TripMap({ position }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        Mapa disponible en la app móvil. Posición: {position ? coordinates(position.latitude, position.longitude) : 'sin datos'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  text: { color: colors.muted, textAlign: 'center', paddingHorizontal: 16 },
});
