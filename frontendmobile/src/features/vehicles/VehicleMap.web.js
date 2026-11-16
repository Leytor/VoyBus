import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../martin-common/theme';

/** En la web (solo pruebas) react-native-maps no esta disponible: se usa la lista. */
export default function VehicleMap({ vehicles }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        Mapa disponible en la app móvil. Vehículos en circulación: {vehicles.length}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  text: { color: colors.muted },
});
