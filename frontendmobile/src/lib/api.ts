import * as SecureStore from 'expo-secure-store';

export const API_BASE=(process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000').replace(/\/$/,'');
const TOKEN_KEY='voybus.session.token';
export class ApiError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);this.name='ApiError';}
}
export async function getToken(){return SecureStore.getItemAsync(TOKEN_KEY);}
export async function setToken(token:string|null){
  if(token)await SecureStore.setItemAsync(TOKEN_KEY,token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}
export async function api<T>(path:string,options:{method?:'GET'|'POST'|'PUT'|'DELETE';body?:unknown;authenticate?:boolean}={}):Promise<T>{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10000);
  const token=options.authenticate===false?null:await getToken();
  try {
    const response=await fetch(`${API_BASE}/api/v1${path}`,{
      method:options.method||'GET',
      headers:{'Accept':'application/json',...(options.body!==undefined?{'Content-Type':'application/json'}:{}),...(token?{'Authorization':`Bearer ${token}`}:{})},
      body:options.body===undefined?undefined:JSON.stringify(options.body),
      signal:controller.signal,
    });
    const parsed=await response.json().catch(()=>null);
    if(!response.ok)throw new ApiError(response.status,parsed?.error?.code||'HTTP_ERROR',parsed?.error?.message||`Error HTTP ${response.status}`);
    return parsed as T;
  } catch(error) {
    if(error instanceof ApiError)throw error;
    throw new ApiError(0,'NETWORK_ERROR',error instanceof Error&&error.name==='AbortError'?'El servidor no respondió a tiempo.':'No se pudo conectar con VoyBus. Revisa la IP de la API y la conexión de red.');
  } finally {clearTimeout(timeout);}
}
export const directionLabel=(direction:string)=>direction==='outbound'?'Ida':direction==='inbound'?'Regreso':direction;
export const localTime=(iso:string|null)=>iso?new Date(iso).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Sin información';
export const qrVehicleCode=(raw:string):string|null=>{
  const value=raw.trim();
  const code=value.startsWith('voybus://vehicle/')?value.substring('voybus://vehicle/'.length):value;
  return /^[A-Za-z0-9-]{3,32}$/.test(code)?code.toUpperCase():null;
};
