import { useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { useMartinApi } from '../martin-common/MartinApiContext';
import { usePolling } from '../martin-common/usePolling';

const ALERT_SOUND = require('./assets/stop-alert.wav');
const BANNER_MS = 6000;

/**
 * VEH-02: alertas de parada del conductor.
 *  - Consulta automatica (sin confirmar manualmente).
 *  - Cada evento nuevo suena y vibra UNA vez; luego se registra como recibido
 *    (POST /alert-events/:id/seen) para no repetirlo al reconectar.
 *  - El aviso visual es un banner que no bloquea la vista del viaje.
 */
export function useStopAlerts(tripId, { enabled = true } = {}) {
  const api = useMartinApi();
  const player = useAudioPlayer(ALERT_SOUND);
  const handled = useRef(new Set());
  const [banner, setBanner] = useState(null);
  const polling = usePolling(() => api.getStopAlerts(tripId), { enabled: enabled && Boolean(tripId) });

  useEffect(() => {
    const events = (polling.data && polling.data.unseenEvents) || [];
    const fresh = events.filter((event) => !handled.current.has(event.eventId));
    if (!fresh.length) {
      // Reintenta registrar recepciones que fallaron (sin volver a sonar).
      events.forEach((event) => api.markAlertSeen(event.eventId).catch(() => undefined));
      return;
    }
    fresh.forEach((event) => handled.current.add(event.eventId));
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // Sin audio disponible: se mantiene el aviso visual y la vibracion.
    }
    Vibration.vibrate([0, 300, 150, 300]);
    setBanner({ text: `Parada solicitada: ${fresh.map((e) => e.stopName).join(', ')}`, at: Date.now() });
    fresh.forEach((event) => api.markAlertSeen(event.eventId).catch(() => undefined));
  }, [api, player, polling.data]);

  useEffect(() => {
    if (!banner) return undefined;
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  return {
    pending: (polling.data && polling.data.pending) || [],
    banner,
    error: polling.error,
    updatedAt: polling.updatedAt,
    refresh: polling.refresh,
  };
}
