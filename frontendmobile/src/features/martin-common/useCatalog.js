import { useCallback, useEffect, useState } from 'react';
import { useMartinApi } from './MartinApiContext';

/**
 * Lineas y recorridos del catalogo (endpoints publicos de Gianny) para mostrar
 * nombres, colores y sentidos en las pantallas de Martin.
 */
export function useCatalog() {
  const api = useMartinApi();
  const [state, setState] = useState({ lines: [], routesById: {}, loading: true, error: null });

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const lines = await api.getLines();
      const routeLists = await Promise.all(lines.map((line) => api.getLineRoutes(line.id).catch(() => [])));
      const routesById = {};
      routeLists.forEach((routes, index) => {
        routes.forEach((route) => {
          routesById[route.id] = { ...route, line: lines[index] };
        });
      });
      setState({ lines, routesById, loading: false, error: null });
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error }));
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
