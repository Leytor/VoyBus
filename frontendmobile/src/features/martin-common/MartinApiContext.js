import { createContext, useContext } from 'react';

const MartinApiContext = createContext(null);

/**
 * La app final envuelve la navegacion con:
 *   <MartinApiProvider api={createMartinApi({ baseUrl, getToken })}>
 * usando la URL base y el token de la sesion de Gianny.
 */
export function MartinApiProvider({ api, children }) {
  return <MartinApiContext.Provider value={api}>{children}</MartinApiContext.Provider>;
}

export function useMartinApi() {
  const api = useContext(MartinApiContext);
  if (!api) throw new Error('Falta <MartinApiProvider> en la raíz de la app.');
  return api;
}
