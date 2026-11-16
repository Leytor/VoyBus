import React,{createContext,useContext,useCallback,useEffect,useMemo,useState} from 'react';
import {AppState} from 'react-native';
import { api,ApiError,getToken,setToken } from '../lib/api';
import {Actor,SessionUser} from '../lib/types';

type AuthState={actor:Actor|null;ready:boolean;signIn:(email:string,password:string)=>Promise<void>;ensureGuest:()=>Promise<void>;signOut:()=>Promise<void>};
const Context=createContext<AuthState|null>(null);
export function AuthProvider({children}:{children:React.ReactNode}){
  const [actor,setActor]=useState<Actor|null>(null);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    let mounted=true;
    const restore=async()=>{
      try{
        if(!await getToken())return;
        const value=await api<{data:Actor}>('/auth/me');
        if(mounted)setActor(value.data);
      }catch(error){
        // Conservar el token ante una falla de red; revocar localmente solo sesiones inválidas.
        if(error instanceof ApiError && error.status===401){
          await setToken(null);
          if(mounted)setActor(null);
        }
      }finally{if(mounted)setReady(true);}
    };
    void restore();
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')void restore();});
    return()=>{mounted=false;subscription.remove();};
  },[]);
  const signIn=useCallback(async(email:string,password:string)=>{
    const result=await api<{data:{token:string;user:SessionUser}}>('/auth/login',{method:'POST',body:{email,password},authenticate:false});
    await setToken(result.data.token);
    setActor({actorType:'user',user:result.data.user});
  },[]);
  const ensureGuest=useCallback(async()=>{
    if(actor)return;
    const result=await api<{data:{token:string}}>('/auth/guest',{method:'POST',authenticate:false});
    await setToken(result.data.token);
    setActor({actorType:'guest',role:'guest'});
  },[actor]);
  const signOut=useCallback(async()=>{
    try {if(actor)await api('/auth/logout',{method:'POST'});}catch{/* El cierre local debe completarse incluso sin conexión. */}
    await setToken(null);setActor(null);
  },[actor]);
  const value=useMemo(()=>({actor,ready,signIn,ensureGuest,signOut}),[actor,ready,signIn,ensureGuest,signOut]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth(){
  const value=useContext(Context);
  if(!value)throw new Error('AuthProvider no está montado.');
  return value;
}
