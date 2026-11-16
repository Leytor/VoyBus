import { useCallback, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { POLL_INTERVAL_MS } from './theme';

/**
 * Consulta periodica mientras la pantalla esta visible y la app en primer plano
 * (contrato: polling ~5 s, sin peticiones en segundo plano).
 * Ante un error conserva el ultimo dato recibido y expone el error.
 */
export function usePolling(fetcher, { intervalMs = POLL_INTERVAL_MS, enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true, updatedAt: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const data = await fetcherRef.current();
      setState({ data, error: null, loading: false, updatedAt: new Date() });
      return data;
    } catch (error) {
      setState((prev) => ({ ...prev, error, loading: false }));
      return undefined;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      let active = true;
      let timer;
      const loop = async () => {
        if (!active) return;
        if (Platform.OS === 'web' || AppState.currentState === 'active') await refresh();
        if (active) timer = setTimeout(loop, intervalMs);
      };
      loop();
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [enabled, intervalMs, refresh]),
  );

  return { ...state, refresh };
}
