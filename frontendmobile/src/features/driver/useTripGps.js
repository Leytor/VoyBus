import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useMartinApi } from '../martin-common/MartinApiContext';
import { GPS_STALE_SECONDS, POLL_INTERVAL_MS } from '../martin-common/theme';

/**
 * VEH-01: comparte la ubicacion GPS del telefono mientras el viaje esta en curso.
 *  - Envia la lectura mas reciente aproximadamente cada 5 s (en primer plano).
 *  - El servidor decide el avance; el cliente solo informa lecturas.
 *  - Si no hay una lectura aceptada en 30 s, la ubicacion se muestra atrasada.
 */
export function useTripGps(tripId, { enabled = true } = {}) {
  const api = useMartinApi();
  const [permission, setPermission] = useState('checking');
  const [position, setPosition] = useState(null);
  const [lastAcceptedAt, setLastAcceptedAt] = useState(null);
  const [lastPassedSequence, setLastPassedSequence] = useState(null);
  const [sendError, setSendError] = useState(null);
  const [now, setNow] = useState(Date.now());
  const latest = useRef(null);
  const lastSent = useRef(0);
  const sending = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!enabled || !tripId) return undefined;
    let subscription;
    let cancelled = false;

    async function send() {
      const sample = latest.current;
      if (!sample || sending.current || Date.now() - lastSent.current < POLL_INTERVAL_MS - 500) return;
      sending.current = true;
      lastSent.current = Date.now();
      try {
        const result = await api.sendLocation(tripId, sample);
        setLastAcceptedAt(new Date(sample.sampledAt));
        setLastPassedSequence(result.lastPassedSequence);
        setSendError(null);
      } catch (error) {
        setSendError(error);
      } finally {
        sending.current = false;
      }
    }

    async function start() {
      const { granted } = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      if (!granted) {
        setPermission('denied');
        return;
      }
      setPermission('granted');
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: POLL_INTERVAL_MS, distanceInterval: 0 },
        (location) => {
          const sample = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracyMeters: location.coords.accuracy ?? null,
            sampledAt: new Date(location.timestamp).toISOString(),
          };
          latest.current = sample;
          setPosition(sample);
          send();
        },
        (reason) => setSendError({ code: 'GPS_ERROR', message: `GPS no disponible: ${reason}` }),
      );
      if (cancelled) subscription.remove();
    }

    start();
    // Reintenta el envio aunque el telefono no entregue lecturas nuevas.
    const retry = setInterval(send, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(retry);
      if (subscription) subscription.remove();
    };
  }, [api, enabled, tripId]);

  const secondsWithoutUpdate = lastAcceptedAt ? Math.round((now - lastAcceptedAt.getTime()) / 1000) : null;
  return {
    permission,
    position,
    lastAcceptedAt,
    lastPassedSequence,
    sendError,
    secondsWithoutUpdate,
    stale: secondsWithoutUpdate === null || secondsWithoutUpdate > GPS_STALE_SECONDS,
  };
}
