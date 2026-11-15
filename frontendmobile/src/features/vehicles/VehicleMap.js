import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { colors } from '../martin-common/theme';

const ANTOFAGASTA = { latitude: -23.645, longitude: -70.4, latitudeDelta: 0.12, longitudeDelta: 0.08 };

/** Mapa de vehiculos en circulacion (movil). */
export default function VehicleMap({ vehicles, colorForLine, selectedTripId, onSelect }) {
  return (
    <MapView style={styles.map} initialRegion={ANTOFAGASTA} accessibilityLabel="Mapa de vehículos en circulación">
      {vehicles.map((v) => (
        <Marker
          key={v.tripId}
          coordinate={{ latitude: v.latitude, longitude: v.longitude }}
          onPress={() => onSelect(v.tripId)}
          tracksViewChanges={false}
        >
          <View
            style={[
              styles.marker,
              { backgroundColor: colorForLine(v.lineId) },
              v.locationStale && styles.markerStale,
              selectedTripId === v.tripId && styles.markerSelected,
            ]}
          >
            <Text style={styles.markerText}>{v.vehicleCode.replace('VB-', '')}</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { height: 320, width: '100%' },
  marker: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    paddingHorizontal: 4,
  },
  markerStale: { opacity: 0.5, borderColor: colors.warning },
  markerSelected: { borderColor: colors.text, transform: [{ scale: 1.15 }] },
  markerText: { color: colors.white, fontWeight: '800', fontSize: 12 },
});
