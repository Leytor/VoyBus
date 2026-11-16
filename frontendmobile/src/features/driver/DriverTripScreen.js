import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useMartinApi } from '../martin-common/MartinApiContext';
import { usePolling } from '../martin-common/usePolling';
import { Badge, Banner, Button, Card, ScreenState, confirmAction, styles } from '../martin-common/ui';
import { colors, spacing } from '../martin-common/theme';
import { directionLabel, formatTime } from '../martin-common/format';
import { martinRoutes } from '../martin-common/routes';
import { useTripGps } from './useTripGps';
import { useStopAlerts } from './useStopAlerts';
import TripMap from './TripMap';

/**
 * Viaje en curso del conductor.
 * VEH-01: comparte GPS, muestra estado de la ubicacion y permite finalizar.
 * VEH-02: alertas de parada agrupadas por paradero, en orden del recorrido.
 */
export default function DriverTripScreen() {
  useScreenAwake();
  const { tripId: tripIdParam } = useLocalSearchParams();
  const tripId = Number(tripIdParam);
  const api = useMartinApi();
  const router = useRouter();
  const [route, setRoute] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(null);

  const shifts = usePolling(() => api.getDriverShifts());
  const planned = useMemo(
    () => (shifts.data || []).flatMap((s) => s.trips.map((t) => ({ ...t, vehicle: s.vehicle }))).find((t) => t.trip && t.trip.tripId === tripId),
    [shifts.data, tripId],
  );
  const isActive = Boolean(planned && planned.trip.status === 'active');
  const gps = useTripGps(tripId, { enabled: isActive });
  const alerts = useStopAlerts(tripId, { enabled: isActive });

  useEffect(() => {
    if (!planned || route) return;
    api.getRoute(planned.routeId).then(setRoute).catch(() => setRoute({ geometry: [], stops: [] }));
  }, [api, planned, route]);

  const lastPassed = gps.lastPassedSequence ?? (planned ? planned.trip.lastPassedSequence : 0);
  const requested = useMemo(() => new Set(alerts.pending.map((p) => p.sequence)), [alerts.pending]);
  const nextStop = route && route.stops ? route.stops.find((s) => s.sequence > lastPassed) : null;

  async function finishTrip() {
    const ok = await confirmAction(
      'Finalizar viaje',
      'Se cerrarán las solicitudes pendientes y los pasajeros quedarán desvinculados. El turno sigue activo.',
    );
    if (!ok) return;
    setFinishing(true);
    setFinishError(null);
    try {
      await api.finishTrip(tripId);
      router.replace(martinRoutes.driverHome);
    } catch (error) {
      setFinishError(error.message);
    } finally {
      setFinishing(false);
    }
  }

  if (!planned) {
    return (
      <View style={styles.screen}>
        <ScreenState
          loading={shifts.loading}
          error={shifts.error}
          onRetry={shifts.refresh}
          empty
          emptyText="No se encontró este viaje entre tus turnos."
        />
      </View>
    );
  }

  if (!isActive) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Banner text="Este viaje ya no está en curso." tone="info" />
        <Button title="Volver a mis turnos" onPress={() => router.replace(martinRoutes.driverHome)} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TripMap
        geometry={route ? route.geometry : []}
        stops={route ? route.stops : []}
        lastPassedSequence={lastPassed}
        requestedSequences={requested}
        position={gps.position}
        lineColor={planned.line.colorHex}
      />

      {alerts.banner ? (
        <View style={local.alertBanner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <Text style={local.alertText}>🔔 {alerts.banner.text}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <View style={styles.row}>
            <Badge text={planned.line.code} color={planned.line.colorHex} />
            <Text style={styles.subtitle}>{planned.line.name}</Text>
          </View>
          <Text style={styles.text}>
            {directionLabel(planned.direction)}: {planned.startLabel} → {planned.endLabel}
          </Text>
          <Text style={styles.muted}>
            Vehículo {planned.vehicle.code} · inicio real {formatTime(planned.trip.startedAt, true)}
          </Text>
          {nextStop ? <Text style={styles.text}>Próximo paradero: {nextStop.sequence}. {nextStop.name}</Text> : null}
        </Card>

        <GpsStatus gps={gps} />

        <Card>
          <Text style={styles.subtitle}>Paradas solicitadas</Text>
          {alerts.error ? <Banner text={alerts.error.message} tone="warning" /> : null}
          {alerts.pending.length === 0 ? (
            <Text style={styles.muted}>Sin solicitudes pendientes.</Text>
          ) : (
            alerts.pending.map((stop) => (
              <View key={stop.tripStopId} style={local.pendingRow}>
                <Text style={styles.text}>
                  {stop.sequence}. {stop.stopName}
                </Text>
                <Badge text={`${stop.requestCount} ${stop.requestCount === 1 ? 'solicitud' : 'solicitudes'}`} tone="warning" />
              </View>
            ))
          )}
          <Text style={styles.muted}>
            {alerts.updatedAt ? `Actualizado ${formatTime(alerts.updatedAt.toISOString(), true)}` : ''}
          </Text>
        </Card>

        <Banner text={finishError} />
        <Button title="Finalizar viaje" variant="danger" loading={finishing} onPress={finishTrip} />
      </ScrollView>
    </View>
  );
}

/** Mantiene la pantalla encendida durante el viaje (solo movil; si falla, no interrumpe). */
function useScreenAwake() {
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const tag = 'voybus-driver-trip';
    activateKeepAwakeAsync(tag).catch(() => undefined);
    return () => {
      deactivateKeepAwake(tag).catch(() => undefined);
    };
  }, []);
}

function GpsStatus({ gps }) {
  if (gps.permission === 'denied') {
    return <Banner text="La ubicación está desactivada. Habilítala en la configuración del teléfono para compartir tu posición." />;
  }
  let text;
  let tone;
  if (gps.secondsWithoutUpdate === null) {
    text = 'Esperando la primera lectura GPS…';
    tone = 'info';
  } else if (gps.stale) {
    text = `Ubicación atrasada: última actualización hace ${gps.secondsWithoutUpdate} s (${formatTime(gps.lastAcceptedAt.toISOString(), true)}).`;
    tone = 'warning';
  } else {
    text = `GPS activo · última actualización hace ${gps.secondsWithoutUpdate} s`;
    tone = 'success';
  }
  return (
    <View style={{ gap: spacing.xs }}>
      <Banner text={text} tone={tone} />
      {gps.sendError ? <Banner text={`Última lectura no enviada: ${gps.sendError.message}`} tone="warning" /> : null}
    </View>
  );
}

const local = StyleSheet.create({
  alertBanner: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    zIndex: 10,
    backgroundColor: colors.warning,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.primaryDark,
  },
  alertText: { color: colors.text, fontWeight: '800', fontSize: 16 },
  pendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
});
