import React,{useCallback,useState} from 'react';
import {Text,Pressable,View,Alert} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import * as Crypto from 'expo-crypto';
import Ionicons from '@expo/vector-icons/Ionicons';
import {ActionButton,Loading,Notice,Panel,Screen,Title,Warning,textStyles} from '../components/UI';
import {api,directionLabel,localTime} from '../lib/api';
import {FutureStops,StopRequest,TripLink} from '../lib/types';
import {useAuth} from '../contexts/AuthContext';
import {colors} from '../lib/theme';
const labels={sent:'Enviada',next:'Próxima',closed:'Cerrada'};
export default function Trip(){
  const {actor}=useAuth();
  const [link,setLink]=useState<TripLink|null>(null),[future,setFuture]=useState<FutureStops|null>(null),[request,setRequest]=useState<StopRequest|null>(null);
  const [choice,setChoice]=useState<number|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[lastUpdate,setLastUpdate]=useState<string|null>(null);
  const [requestKey,setRequestKey]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    if(!actor){setLoading(false);return;}
    try{
      const [l,q]=await Promise.all([api<{data:TripLink|null}>('/me/trip-link'),api<{data:StopRequest|null}>('/me/stop-request')]);
      const nextFuture=l.data?await api<{data:FutureStops}>('/me/trip-link/stops'):null;
      setLink(l.data);setRequest(q.data);setFuture(nextFuture?.data||null);setError('');setLastUpdate(new Date().toISOString());
      setChoice(current=>nextFuture?.data.stops.some(s=>s.tripStopId===current)?current:null);
      if(q.data)setRequestKey(null);
    }catch(e){setError(e instanceof Error?e.message:'Información no disponible.');}
    finally{setLoading(false);}
  },[actor]);
  useFocusEffect(useCallback(()=>{
    let active=true;
    // Se consulta solamente mientras esta pantalla está visible.
    void refresh();
    const timer=setInterval(()=>{if(active)void refresh();},5000);
    return()=>{active=false;clearInterval(timer);};
  },[refresh]));
  const submit=async()=>{
    if(!choice)return;
    const key=requestKey||Crypto.randomUUID();
    setRequestKey(key);setBusy(true);setError('');
    try{const r=await api<{data:StopRequest}>('/me/stop-requests',{method:'POST',body:{tripStopId:choice,idempotencyKey:key}});setRequest(r.data);setChoice(null);setRequestKey(null);await refresh();}
    catch(e){setError(e instanceof Error?e.message:'La solicitud no pudo registrarse.');}
    finally{setBusy(false);}
  };
  const unlink=()=>Alert.alert('Finalizar vinculación','La solicitud que ya enviaste puede continuar activa para el conductor.',[
    {text:'Cancelar',style:'cancel'},
    {text:'Desvincular',style:'destructive',onPress:()=>{void (async()=>{try{await api('/me/trip-link',{method:'DELETE'});await refresh();}catch(e){setError(e instanceof Error?e.message:'No se pudo desvincular.');}})();}}
  ]);
  if(!actor)return <Screen><Title>Mi viaje</Title><Panel><Text style={textStyles.muted}>Para vincularte, ingresa o continúa como invitado.</Text><ActionButton label="Vincular vehículo" onPress={()=>router.push('/connect')}/></Panel></Screen>;
  const pending=request&&(request.status==='sent'||request.status==='next');
  return <Screen><Title subtitle={lastUpdate?`Última consulta: ${localTime(lastUpdate)}`:'Actualización automática cada 5 segundos'}>Mi viaje</Title>
    {loading?<Loading/>:null}{error?<Warning message={`${error} Se conserva la última información conocida.`}/>:null}
    {link?<Panel><Text style={textStyles.heading}>Viaje vinculado</Text>
      <Text style={textStyles.body}>Vehículo: {link.vehicleCode}</Text><Text style={textStyles.body}>Línea: {link.lineCode}</Text>
      <Text style={textStyles.body}>Sentido: {directionLabel(link.direction)}</Text>
      <ActionButton label="Desvincularme" variant="outline" onPress={unlink}/>
    </Panel>:<Panel><Text style={textStyles.muted}>No tienes un vínculo activo con un vehículo.</Text><ActionButton label="Vincular vehículo" onPress={()=>router.push('/connect')}/></Panel>}
    {request?<Panel><Text style={textStyles.heading}>Solicitud de parada</Text>
      <Text style={textStyles.body}>Destino: {request.destination.name} ({request.destination.code})</Text>
      <Text style={{color:request.status==='closed'?colors.textMuted:colors.success,fontWeight:'700',fontSize:17}}>Estado: {labels[request.status]}</Text>
      <Text style={textStyles.muted}>Solicitada a las {localTime(request.requestedAt)}</Text>
      {request.status==='closed'?<Text style={textStyles.body}>{request.closureReason==='stop_passed'?'El vehículo superó el paradero solicitado. No significa que se haya detenido.':'El viaje terminó antes de confirmar la parada.'}</Text>:null}
      {request.locationStale?<Warning message={`Ubicación sin actualizar. Último GPS: ${localTime(request.locationUpdatedAt)}. El estado podría estar atrasado.`}/>:<Text style={textStyles.muted}>Última ubicación: {localTime(request.locationUpdatedAt)}</Text>}
    </Panel>:null}
    {link&&future&&!pending?<Panel><Text style={textStyles.heading}>Solicitar una parada</Text>
      <Text style={textStyles.muted}>Solo aparecen los paraderos que el vehículo todavía no ha superado.</Text>
      {future.locationStale?<Warning message={`GPS atrasado. Último dato: ${localTime(future.locationUpdatedAt)}. Confirma tu destino antes de enviarlo.`}/>:null}
      {!future.stops.length?<Text style={textStyles.muted}>No quedan paraderos futuros disponibles.</Text>:null}
      {future.stops.map(s=><Pressable key={s.tripStopId} accessibilityRole="radio" accessibilityState={{selected:choice===s.tripStopId}} onPress={()=>{setChoice(s.tripStopId);setRequestKey(null);}}
        style={{flexDirection:'row',gap:10,alignItems:'center',borderColor:choice===s.tripStopId?colors.primary:colors.border,borderWidth:1,backgroundColor:choice===s.tripStopId?'#FFF3F3':colors.white,borderRadius:10,padding:13}}>
        <Ionicons name={choice===s.tripStopId?'radio-button-on':'radio-button-off'} size={22} color={choice===s.tripStopId?colors.primary:colors.textMuted}/>
        <View style={{flex:1}}><Text style={textStyles.body}>{s.sequence}. {s.name}</Text><Text style={textStyles.muted}>{s.code}{s.isNext?' · Siguiente paradero':''}</Text></View>
      </Pressable>)}
      <ActionButton label={busy?'Enviando...':'Solicitar parada'} disabled={busy||!choice} onPress={()=>{void submit();}}/>
    </Panel>:null}
    {link&&pending?<Notice message="Ya tienes una solicitud pendiente. Su estado se actualizará automáticamente; no es necesario enviarla nuevamente."/>:null}
    {link?<Notice message="VoyBus registra la solicitud, pero no puede confirmar por GPS que el conductor haya detenido el vehículo ni que el pasajero haya descendido."/>:null}
  </Screen>;
}
