import React,{useCallback,useState} from 'react';
import {Text,Pressable} from 'react-native';
import {useFocusEffect,useLocalSearchParams,router} from 'expo-router';
import {ActionButton,Loading,Panel,Screen,Title,Warning,textStyles} from '../../components/UI';
import {RouteMap} from '../../components/RouteMap';
import {api,directionLabel} from '../../lib/api';
import {StopDetail,Stop} from '../../lib/types';
import {useAuth} from '../../contexts/AuthContext';
import {colors} from '../../lib/theme';
export default function StopDetailScreen(){
  const {stopId}=useLocalSearchParams<{stopId:string}>();
  const {actor}=useAuth(),registered=actor?.actorType==='user'&&actor.user.role==='passenger';
  const [stop,setStop]=useState<StopDetail|null>(null),[favorite,setFavorite]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useFocusEffect(useCallback(()=>{
    let alive=true;
    (async()=>{try{
      const data=await api<{data:StopDetail}>(`/stops/${stopId}`,{authenticate:false});if(alive){setStop(data.data);setError('');}
      if(registered){const r=await api<{data:Stop[]}>('/me/favorite-stops');if(alive)setFavorite(r.data.some(x=>x.id===Number(stopId)));}
    }catch(e){if(alive)setError(e instanceof Error?e.message:'No se pudo cargar el paradero.');}finally{if(alive)setLoading(false);}})();
    return()=>{alive=false;};
  },[stopId,registered]));
  const toggle=async()=>{
    setBusy(true);setError('');
    try{await api(`/me/favorite-stops/${stopId}`,{method:favorite?'DELETE':'PUT'});setFavorite(!favorite);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el favorito.');}
    finally{setBusy(false);}
  };
  return <Screen>{loading?<Loading/>:null}{error?<Warning message={error}/>:null}{stop?<>
    <Title subtitle={stop.code}>{stop.name}</Title>
    <RouteMap stops={[stop]}/>
    {registered?<ActionButton label={favorite?'Quitar de favoritos':'Guardar en favoritos'} icon={favorite?'star':'star-outline'} variant="outline" disabled={busy} onPress={()=>{void toggle();}}/>:
      <Panel><Text style={textStyles.muted}>Inicia sesión como pasajero para guardar este paradero en favoritos.</Text><ActionButton label="Iniciar sesión" variant="outline" onPress={()=>router.push('/sign-in')}/></Panel>}
    <Panel><Text style={textStyles.heading}>Líneas y sentidos que pasan por este paradero</Text>
      {stop.routes.map((r,i)=><Pressable key={`${r.routeId}-${i}`} accessibilityRole="button" onPress={()=>router.push({pathname:'/routes/[routeId]',params:{routeId:String(r.routeId)}})} style={{paddingVertical:12,borderBottomColor:colors.border,borderBottomWidth:1}}>
        <Text style={{fontWeight:'700',color:colors.primary}}>{r.lineCode} · {r.lineName}</Text><Text style={textStyles.body}>{directionLabel(r.direction)} · Parada {r.sequence}</Text>
        <Text style={textStyles.muted}>{r.startLabel} → {r.endLabel}</Text>
        {r.lineStatus==='suspended'?<Text style={{color:colors.danger}}>Servicio suspendido</Text>:null}
      </Pressable>)}
      {!stop.routes.length?<Text style={textStyles.muted}>No hay recorridos activos asociados.</Text>:null}
    </Panel>
  </>:null}</Screen>;
}
