import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMartinApi } from '../martin-common/MartinApiContext';
import { useCatalog } from '../martin-common/useCatalog';
import { Banner, Button, Card, Field, OptionPicker, ScreenState, styles } from '../martin-common/ui';
import { spacing } from '../martin-common/theme';
import { VEHICLE_STATUS, directionLabel } from '../martin-common/format';
import { martinRoutes } from '../martin-common/routes';
import { emptyForm, emptyTrip, formFromShift, payloadFromForm, validateForm } from './shiftForm';

/**
 * ADM-03: crear o modificar un turno (conductor, vehiculo, horario, tolerancia
 * y viajes en orden). Las reglas (solapamientos, conductor habilitado, vehiculo
 * operativo, horarios) las valida el servidor y sus mensajes se muestran aqui.
 */
export default function ShiftFormScreen() {
  const { shiftId: shiftIdParam } = useLocalSearchParams();
  const shiftId = shiftIdParam ? Number(shiftIdParam) : null;
  const api = useMartinApi();
  const router = useRouter();
  const catalog = useCatalog();
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [original, setOriginal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [driverList, vehicleList, shifts] = await Promise.all([
          api.getAdminDrivers(),
          api.getAdminVehicles(),
          shiftId ? api.getAdminShifts() : Promise.resolve([]),
        ]);
        if (!alive) return;
        setDrivers(driverList);
        setVehicles(vehicleList);
        if (shiftId) {
          const shift = shifts.find((s) => s.id === shiftId);
          if (!shift) throw new Error('El turno no existe o está fuera del período consultado.');
          setOriginal(shift);
          setForm(formFromShift(shift));
        }
      } catch (error) {
        if (alive) setLoadError(error);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api, shiftId]);

  const inProgress = Boolean(original && original.status === 'active');
  const driverOptions = drivers.map((d) => ({
    value: d.id,
    label: d.enabled ? d.fullName : `${d.fullName} (deshabilitado)`,
  }));
  const vehicleOptions = vehicles.map((v) => ({
    value: v.id,
    label: `${v.code} · ${v.plate}`,
    hint: VEHICLE_STATUS[v.status] + (v.assignable ? '' : ' — no asignable'),
  }));
  const routeOptions = useMemo(
    () =>
      Object.values(catalog.routesById).map((r) => ({
        value: r.id,
        label: `${r.line.code} ${directionLabel(r.direction)}: ${r.startLabel} → ${r.endLabel}`,
        hint: r.line.name,
      })),
    [catalog.routesById],
  );

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setTrip = (index, key, value) =>
    setForm((prev) => ({ ...prev, trips: prev.trips.map((t, i) => (i === index ? { ...t, [key]: value } : t)) }));

  async function save() {
    const validation = validateForm(form);
    setErrors(validation);
    setServerError(null);
    if (Object.keys(validation).length) return;
    const payload = payloadFromForm(form);
    setSaving(true);
    try {
      if (shiftId) {
        // Con el turno en curso solo se ajustan tolerancia y termino (regla del servidor).
        const body = inProgress
          ? { toleranceMinutes: payload.toleranceMinutes, plannedEndAt: payload.plannedEndAt }
          : payload;
        await api.updateShift(shiftId, body);
      } else {
        await api.createShift(payload);
      }
      router.replace(martinRoutes.adminShifts);
    } catch (error) {
      setServerError(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || loadError) {
    return (
      <View style={styles.screen}>
        <ScreenState loading={loading} error={loadError} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{shiftId ? `Editar turno #${shiftId}` : 'Nuevo turno'}</Text>
      {inProgress ? (
        <Banner text="El turno está en curso: solo puedes ajustar la tolerancia y la hora de término." tone="info" />
      ) : null}

      <Card>
        <OptionPicker label="Conductor" value={form.driverUserId} options={driverOptions} onChange={(v) => set('driverUserId', v)} />
        {errors.driverUserId ? <Text style={styles.fieldError}>{errors.driverUserId}</Text> : null}
        <OptionPicker label="Vehículo" value={form.vehicleId} options={vehicleOptions} onChange={(v) => set('vehicleId', v)} />
        {errors.vehicleId ? <Text style={styles.fieldError}>{errors.vehicleId}</Text> : null}
        <Field label="Fecha (AAAA-MM-DD)" value={form.date} onChangeText={(v) => set('date', v)} error={errors.date} editable={!inProgress} />
        <View style={[styles.row, { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1 }}>
            <Field label="Inicio (HH:MM)" value={form.start} onChangeText={(v) => set('start', v)} error={errors.start} placeholder="07:00" editable={!inProgress} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Término (HH:MM)" value={form.end} onChangeText={(v) => set('end', v)} error={errors.end} placeholder="15:00" />
          </View>
        </View>
        <Field
          label="Tolerancia de atraso (minutos)"
          value={form.tolerance}
          onChangeText={(v) => set('tolerance', v)}
          keyboardType="number-pad"
          error={errors.tolerance}
        />
      </Card>

      <Card>
        <Text style={styles.subtitle}>Viajes del turno (en orden)</Text>
        {catalog.error ? <Banner text="No se pudieron cargar los recorridos." onRetry={catalog.reload} /> : null}
        {form.trips.map((trip, index) => (
          <View key={trip.key} style={{ gap: spacing.xs, borderTopWidth: index ? 1 : 0, borderTopColor: '#E9ECEF', paddingTop: index ? spacing.sm : 0 }}>
            <OptionPicker
              label={`Viaje ${index + 1}: línea, recorrido y sentido`}
              value={trip.routeId}
              options={routeOptions}
              onChange={(v) => setTrip(index, 'routeId', v)}
            />
            <View style={[styles.row, { alignItems: 'flex-start' }]}>
              <View style={{ flex: 1 }}>
                <Field label="Inicio" value={trip.start} onChangeText={(v) => setTrip(index, 'start', v)} placeholder="07:30" editable={!inProgress} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Término" value={trip.end} onChangeText={(v) => setTrip(index, 'end', v)} placeholder="09:00" editable={!inProgress} />
              </View>
            </View>
            {errors[`trip${index}`] ? <Text style={styles.fieldError}>{errors[`trip${index}`]}</Text> : null}
            {!inProgress && form.trips.length > 1 ? (
              <Button
                title="Quitar viaje"
                variant="ghost"
                compact
                onPress={() => setForm((prev) => ({ ...prev, trips: prev.trips.filter((_, i) => i !== index) }))}
              />
            ) : null}
          </View>
        ))}
        {!inProgress ? (
          <Button
            title="Agregar viaje"
            variant="secondary"
            compact
            onPress={() => setForm((prev) => ({ ...prev, trips: [...prev.trips, emptyTrip(prev.trips.length + 1)] }))}
          />
        ) : null}
      </Card>

      <Banner text={serverError} />
      <Button title={shiftId ? 'Guardar cambios' : 'Crear turno'} loading={saving} onPress={save} />
    </ScrollView>
  );
}
