import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { colors } from '../martin-common/theme';

/** Mapa del viaje del conductor: trazado, paraderos y posicion propia (movil). */
export default function TripMap({ geometry, stops, lastPassedSequence, requestedSequences, position, lineColor }) {
  const first = (geometry && geometry[0]) || (stops && stops[0]);
  const region = first
    ? { latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.06, longitudeDelta: 0.04 }
    : undefined;
  return (
    <MapView style={styles.map} initialRegion={region} accessibilityLabel="Mapa del recorrido">
      {geometry && geometry.length > 1 ? (
        <Polyline coordinates={geometry} strokeColor={lineColor || colors.secondary} strokeWidth={5} />
      ) : null}
      {(stops || []).map((stop) => {
        const passed = stop.sequence <= (lastPassedSequence || 0);
        const requested = requestedSequences.has(stop.sequence);
        return (
          <Marker
            key={stop.sequence}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            title={`${stop.sequence}. ${stop.name}`}
            tracksViewChanges={false}
          >
            <View style={[styles.stop, passed && styles.stopPassed, requested && styles.stopRequested]}>
              <Text style={styles.stopText}>{stop.sequence}</Text>
            </View>
          </Marker>
        );
      })}
      {position ? (
        <Marker coordinate={position} title="Tu posición" tracksViewChanges={false}>
          <View style={styles.bus} />
        </Marker>
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { height: 260, width: '100%' },
  stop: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopPassed: { borderColor: colors.border, opacity: 0.6 },
  stopRequested: { backgroundColor: colors.warning, borderColor: colors.primaryDark },
  stopText: { fontSize: 11, fontWeight: '800', color: colors.text },
  bus: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.white,
  },
});
