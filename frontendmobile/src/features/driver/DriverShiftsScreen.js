import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMartinApi } from '../martin-common/MartinApiContext';
import { usePolling } from '../martin-common/usePolling';
import { Badge, Banner, Button, Card, ScreenState, confirmAction, styles } from '../martin-common/ui';
import { spacing } from '../martin-common/theme';
import {
  SHIFT_STATUS,
  TRIP_STATUS,
  VEHICLE_STATUS,
  directionLabel,
  formatDateTimeRange,
  formatTime,
  punctualityLabel,
} from '../martin-common/format';
import { martinRoutes } from '../martin-common/routes';
import { ensureLocationPermission } from './locationPermission';

/**
 * VEH-01 (y ADM-03 visto por el conductor): turnos asignados, vehiculo, linea,
 * recorrido, sentido y horario. Las asignaciones nuevas aparecen solas (polling).
 */
export default function DriverShiftsScreen() {
  const api = useMartinApi();
  const router = useRouter();
  const polling = usePolling(() => api.getDriverShifts());
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  const shifts = polling.data || [];
  const activeTrip = shifts
    .flatMap((s) => s.trips)
    .find((t) => t.trip && t.trip.status === 'active');

  async function run(key, action) {
    setBusy(key);
    setActionError(null);
    try {
      await action();
      await polling.refresh();
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(null);
    }
  }

  const startShift = (shift) => run(`shift-${shift.id}`, () => api.startShift(shift.id));

  const finishShift = async (shift) => {
    const ok = await confirmAction('Finalizar turno', '¿Confirmas que terminas tu turno y entregas el vehículo?');
    if (ok) await run(`shift-${shift.id}`, () => api.finishShift(shift.id));
  };

  const startTrip = (plannedTrip) =>
    run(`trip-${plannedTrip.shiftTripId}`, async () => {
      if (!(await ensureLocationPermission())) {
        throw new Error('Debes habilitar la ubicación del teléfono para iniciar el viaje.');
      }
      const trip = await api.startTrip(plannedTrip.shiftTripId);
      router.push(martinRoutes.driverTrip(trip.tripId));
    });

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={shifts}
      keyExtractor={(s) => String(s.id)}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.title}>Mis turnos</Text>
          {activeTrip ? (
            <Button
              title={`Volver al viaje en curso (${activeTrip.line.code})`}
              variant="secondary"
              onPress={() => router.push(martinRoutes.driverTrip(activeTrip.trip.tripId))}
            />
          ) : null}
          <Banner text={actionError} />
          {polling.error && polling.data ? <Banner text={polling.error.message} tone="warning" /> : null}
        </View>
      }
      ListEmptyComponent={
        <ScreenState
          loading={polling.loading && !polling.data}
          error={!polling.data ? polling.error : null}
          onRetry={polling.refresh}
          empty
          emptyText="No tienes turnos asignados."
        />
      }
      renderItem={({ item: shift }) => {
        const punctuality = punctualityLabel(shift.punctuality);
        return (
          <Card>
            <View style={styles.row}>
              <Text style={styles.subtitle}>{formatDateTimeRange(shift.plannedStartAt, shift.plannedEndAt)}</Text>
              <Badge text={SHIFT_STATUS[shift.status]} tone={shift.status === 'active' ? 'success' : 'neutral'} />
            </View>
            <Text style={styles.text}>
              Vehículo {shift.vehicle.code} · {shift.vehicle.plate} · {VEHICLE_STATUS[shift.vehicle.status]}
            </Text>
            <View style={styles.row}>
              {punctuality ? <Badge text={punctuality.text} tone={punctuality.tone} /> : null}
              <Text style={styles.muted}>Tolerancia {shift.toleranceMinutes} min</Text>
              {shift.actualStartAt ? <Text style={styles.muted}>Inicio real {formatTime(shift.actualStartAt)}</Text> : null}
            </View>

            {shift.trips.map((planned) => {
              const status = planned.trip ? planned.trip.status : null;
              const canStart = shift.status === 'active' && !planned.trip && !activeTrip;
              return (
                <View key={planned.shiftTripId} style={{ borderTopWidth: 1, borderTopColor: '#E9ECEF', paddingTop: spacing.sm, gap: 4 }}>
                  <View style={styles.row}>
                    <Text style={styles.text}>Viaje {planned.sequence}</Text>
                    <Badge text={planned.line.code} color={planned.line.colorHex} />
                    <Text style={styles.text}>{directionLabel(planned.direction)}</Text>
                    {status ? <Badge text={TRIP_STATUS[status]} tone={status === 'active' ? 'success' : 'neutral'} /> : null}
                  </View>
                  <Text style={styles.muted}>
                    {planned.line.name}: {planned.startLabel} → {planned.endLabel}
                  </Text>
                  <Text style={styles.muted}>
                    Horario previsto {formatTime(planned.plannedStartAt)}–{formatTime(planned.plannedEndAt)}
                  </Text>
                  {canStart ? (
                    <Button
                      title="Iniciar viaje"
                      compact
                      loading={busy === `trip-${planned.shiftTripId}`}
                      onPress={() => startTrip(planned)}
                    />
                  ) : null}
                  {status === 'active' ? (
                    <Button
                      title="Ir al viaje en curso"
                      compact
                      variant="secondary"
                      onPress={() => router.push(martinRoutes.driverTrip(planned.trip.tripId))}
                    />
                  ) : null}
                </View>
              );
            })}

            {shift.status === 'scheduled' ? (
              <Button title="Iniciar turno" loading={busy === `shift-${shift.id}`} onPress={() => startShift(shift)} />
            ) : null}
            {shift.status === 'active' ? (
              <Button
                title="Finalizar turno"
                variant="ghost"
                loading={busy === `shift-${shift.id}`}
                onPress={() => finishShift(shift)}
              />
            ) : null}
          </Card>
        );
      }}
    />
  );
}
