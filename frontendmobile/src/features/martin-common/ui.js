import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing } from './theme';

export function Button({ title, onPress, variant = 'primary', disabled, loading, compact, accessibilityLabel }) {
  const style = [
    styles.button,
    compact && styles.buttonCompact,
    variant === 'secondary' && styles.buttonSecondary,
    variant === 'ghost' && styles.buttonGhost,
    variant === 'danger' && styles.buttonDanger,
    (disabled || loading) && styles.buttonDisabled,
  ];
  const textStyle = [styles.buttonText, variant === 'ghost' && styles.buttonGhostText];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [...style, pressed && styles.pressed]}
    >
      {loading ? <ActivityIndicator color={variant === 'ghost' ? colors.primary : colors.white} /> : (
        <Text style={textStyle}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const BADGE_TONES = {
  neutral: { bg: colors.background, fg: colors.text },
  success: { bg: '#E8F5E9', fg: colors.success },
  danger: { bg: '#FDECEA', fg: colors.primaryDark },
  warning: { bg: '#FFF8E1', fg: '#7A5200' },
  info: { bg: '#E3F2FD', fg: colors.secondary },
};

export function Badge({ text, tone = 'neutral', color }) {
  const palette = BADGE_TONES[tone] || BADGE_TONES.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: color || palette.bg }]}>
      <Text style={[styles.badgeText, { color: color ? colors.white : palette.fg }]}>{text}</Text>
    </View>
  );
}

export function Banner({ text, tone = 'danger', onRetry }) {
  if (!text) return null;
  const palette = BADGE_TONES[tone] || BADGE_TONES.danger;
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]} accessibilityRole="alert">
      <Text style={[styles.bannerText, { color: palette.fg }]}>{text}</Text>
      {onRetry ? <Button title="Reintentar" variant="ghost" compact onPress={onRetry} /> : null}
    </View>
  );
}

/** Estados de carga, vacio y error visibles en todas las pantallas (RNF-02). */
export function ScreenState({ loading, error, empty, emptyText, onRetry }) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Cargando…</Text>
      </View>
    );
  }
  if (error) return <Banner text={error.message} onRetry={onRetry} />;
  if (empty) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{emptyText}</Text>
      </View>
    );
  }
  return null;
}

export function Field({ label, error, ...inputProps }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, error && styles.inputError]}
        {...inputProps}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

/** Selector simple en modal (sin dependencias adicionales). */
export function OptionPicker({ label, value, options, onChange, placeholder = 'Seleccionar…' }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected ? selected.label : placeholder}`}
        style={styles.input}
        onPress={() => setOpen(true)}
      >
        <Text style={{ color: selected ? colors.text : colors.muted }}>{selected ? selected.label : placeholder}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(o) => String(o.value)}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  style={[styles.option, item.value === value && styles.optionSelected]}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                  {item.hint ? <Text style={styles.optionHint}>{item.hint}</Text> : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Confirmacion multiplataforma (Alert en movil, confirm en web). */
export function confirmAction(title, message) {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Confirmar', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function notify(title, message) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { minHeight: 40, paddingHorizontal: spacing.md },
  buttonSecondary: { backgroundColor: colors.secondary },
  buttonGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  buttonDanger: { backgroundColor: colors.primaryDark },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  buttonGhostText: { color: colors.primary },
  pressed: { opacity: 0.8 },
  badge: { borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  banner: {
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  bannerText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    backgroundColor: colors.white,
    color: colors.text,
  },
  inputError: { borderColor: colors.primary },
  fieldError: { color: colors.primaryDark, fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.white,
    maxHeight: '70%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: spacing.sm, color: colors.text },
  option: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.background },
  optionSelected: { backgroundColor: '#FDECEA' },
  optionText: { fontSize: 15, color: colors.text },
  optionHint: { fontSize: 13, color: colors.muted },
});
