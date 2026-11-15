import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useMartinApi } from '../martin-common/MartinApiContext';
import { usePolling } from '../martin-common/usePolling';
import { useCatalog } from '../martin-common/useCatalog';
import { Badge, Banner, Card, ScreenState, styles } from '../martin-common/ui';
import { colors, spacing } from '../martin-common/theme';
import { coordinates, directionLabel, formatAgo, formatTime } from '../martin-common/format';
import VehicleMap from './VehicleMap';

/**
 * Visualizacion de vehiculos (segundo RED-02 de la ERS). Publica: no requiere sesion.
 * Muestra solo vehiculos con viaje activo, filtra por linea y se actualiza sola.
 */
export default function ActiveVehiclesScreen() {
  const api = useMartinApi();
  const catalog = useCatalog();
  const [lineId, setLineId] = useState(null);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const polling = usePolling(() => api.getActiveVehicles(lineId));

  useEffect(() => {
    polling.refresh();
    setSelectedTripId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const vehicles = polling.data || [];
  const linesById = useMemo(() => Object.fromEntries(catalog.lines.map((l) => [l.id, l])), [catalog.lines]);
  const colorForLine = (id) => (linesById[id] ? linesById[id].colorHex : colors.secondary);
  const selected = vehicles.find((v) => v.tripId === selectedTripId);

  return (
    <View style={styles.screen}>
      <VehicleMap
        vehicles={vehicles}
        colorForLine={colorForLine}
        selectedTripId={selectedTripId}
        onSelect={setSelectedTripId}
      />

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          <LineChip label="Todas" active={lineId === null} onPress={() => setLineId(null)} />
          {catalog.lines.map((line) => (
            <LineChip
              key={line.id}
              label={line.code}
              color={line.colorHex}
              active={lineId === line.id}
              onPress={() => setLineId(line.id)}
            />
          ))}
        </ScrollView>
        {catalog.error ? <Banner text="No se pudieron cargar las líneas." tone="warning" onRetry={catalog.reload} /> : null}
        {polling.error && polling.data ? (
          <Banner text={`${polling.error.message} Se muestran los últimos datos recibidos.`} tone="warning" />
        ) : null}
        <Text style={styles.muted}>
          {polling.updatedAt ? `Actualizado a las ${formatTime(polling.updatedAt.toISOString(), true)} · cada 5 s` : ' '}
        </Text>
      </View>

      {selected ? (
        <VehicleDetail vehicle={selected} line={linesById[selected.lineId]} route={catalog.routesById[selected.routeId]} now={now} />
      ) : null}

      <FlatList
        data={vehicles}
        keyExtractor={(v) => String(v.tripId)}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <ScreenState
            loading={polling.loading && !polling.data}
            error={!polling.data ? polling.error : null}
            onRetry={polling.refresh}
            empty
            emptyText={lineId ? 'No hay vehículos en circulación en esta línea.' : 'No hay vehículos en circulación.'}
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Vehículo ${item.vehicleCode}`}
            onPress={() => setSelectedTripId(item.tripId)}
          >
            <Card style={item.tripId === selectedTripId ? { borderColor: colors.primary, borderWidth: 2 } : null}>
              <View style={styles.row}>
                <Badge text={linesById[item.lineId] ? linesById[item.lineId].code : `Línea ${item.lineId}`} color={colorForLine(item.lineId)} />
                <Text style={styles.subtitle}>{item.vehicleCode}</Text>
                <Text style={styles.muted}>{directionLabel(item.direction)}</Text>
                {item.locationStale ? <Badge text="Ubicación atrasada" tone="warning" /> : null}
              </View>
              <Text style={styles.muted}>Última actualización {formatAgo(item.locationUpdatedAt, now)}</Text>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}

function LineChip({ label, color, active, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Filtrar línea ${label}`}
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md,
        minHeight: 40,
        justifyContent: 'center',
        borderRadius: 999,
        borderWidth: 2,
        borderColor: color || colors.primary,
        backgroundColor: active ? color || colors.primary : colors.white,
      }}
    >
      <Text style={{ fontWeight: '700', color: active ? colors.white : colors.text }}>{label}</Text>
    </Pressable>
  );
}

function VehicleDetail({ vehicle, line, route, now }) {
  return (
    <Card style={{ marginHorizontal: spacing.lg, marginTop: spacing.sm }}>
      <View style={styles.row}>
        <Text style={styles.title}>Vehículo {vehicle.vehicleCode}</Text>
        {vehicle.locationStale ? <Badge text="Ubicación atrasada" tone="warning" /> : <Badge text="En circulación" tone="success" />}
      </View>
      <Text style={styles.text}>Línea: {line ? `${line.code} · ${line.name}` : vehicle.lineId}</Text>
      <Text style={styles.text}>
        Recorrido: {route ? `${route.startLabel} → ${route.endLabel}` : `#${vehicle.routeId}`}
      </Text>
      <Text style={styles.text}>Sentido: {directionLabel(vehicle.direction)}</Text>
      <Text style={styles.text}>Última ubicación: {coordinates(vehicle.latitude, vehicle.longitude)}</Text>
      <Text style={styles.text}>
        Hora de la última actualización: {formatTime(vehicle.locationUpdatedAt, true)} ({formatAgo(vehicle.locationUpdatedAt, now)})
      </Text>
    </Card>
  );
}
