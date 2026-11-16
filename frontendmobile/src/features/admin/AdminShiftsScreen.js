import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMartinApi } from '../martin-common/MartinApiContext';
import { usePolling } from '../martin-common/usePolling';
import { Badge, Banner, Button, Card, ScreenState, confirmAction, styles } from '../martin-common/ui';
import { spacing } from '../martin-common/theme';
import { SHIFT_STATUS, directionLabel, formatDateTimeRange, formatTime, punctualityLabel } from '../martin-common/format';
import { martinRoutes } from '../martin-common/routes';

/** ADM-03: listado de turnos y asignaciones, con puntualidad segun la tolerancia. */
export default function AdminShiftsScreen() {
  const api = useMartinApi();
  const router = useRouter();
  const polling = usePolling(() => api.getAdminShifts());
  const [error, setError] = useState(null);

  async function cancelShift(shift) {
    const ok = await confirmAction('Cancelar turno', `¿Cancelar el turno de ${shift.driver.fullName}?`);
    if (!ok) return;
    try {
      setError(null);
      await api.updateShift(shift.id, { status: 'cancelled' });
      await polling.refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={polling.data || []}
      keyExtractor={(s) => String(s.id)}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={styles.title}>Turnos y asignaciones</Text>
            <Button title="Nuevo turno" compact onPress={() => router.push(martinRoutes.adminShiftForm())} />
          </View>
          <Banner text={error} />
          {polling.error && polling.data ? <Banner text={polling.error.message} tone="warning" /> : null}
        </View>
      }
      ListEmptyComponent={
        <ScreenState
          loading={polling.loading && !polling.data}
          error={!polling.data ? polling.error : null}
          onRetry={polling.refresh}
          empty
          emptyText="No hay turnos en el período consultado."
        />
      }
      renderItem={({ item: shift }) => {
        const punctuality = punctualityLabel(shift.punctuality);
        const editable = shift.status === 'scheduled' || shift.status === 'active';
        return (
          <Card>
            <View style={styles.row}>
              <Text style={styles.subtitle}>{shift.driver.fullName}</Text>
              <Badge text={SHIFT_STATUS[shift.status]} tone={shift.status === 'active' ? 'success' : 'neutral'} />
              {punctuality && editable ? <Badge text={punctuality.text} tone={punctuality.tone} /> : null}
            </View>
            <Text style={styles.text}>
              {formatDateTimeRange(shift.plannedStartAt, shift.plannedEndAt)} · Vehículo {shift.vehicle.code}
            </Text>
            <Text style={styles.muted}>Tolerancia de atraso: {shift.toleranceMinutes} min</Text>
            {shift.trips.map((t) => (
              <Text key={t.shiftTripId} style={styles.muted}>
                {t.sequence}. {t.line.code} {directionLabel(t.direction)} ({t.startLabel} → {t.endLabel}) ·{' '}
                {formatTime(t.plannedStartAt)}–{formatTime(t.plannedEndAt)}
              </Text>
            ))}
            {editable ? (
              <View style={styles.row}>
                <Button title="Editar" compact variant="secondary" onPress={() => router.push(martinRoutes.adminShiftForm(shift.id))} />
                {shift.status === 'scheduled' ? (
                  <Button title="Cancelar turno" compact variant="ghost" onPress={() => cancelShift(shift)} />
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      }}
    />
  );
}
