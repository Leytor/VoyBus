import React,{useCallback,useState} from 'react';
import {Text,Pressable,View} from 'react-native';
import {router,useLocalSearchParams,useFocusEffect} from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {Loading,Panel,Screen,Title,Warning,textStyles} from '../../components/UI';
import {RouteMap} from '../../components/RouteMap';
import {api,directionLabel} from '../../lib/api';
import {Route} from '../../lib/types';
import {colors} from '../../lib/theme';
export default function RouteScreen(){
  const {routeId}=useLocalSearchParams<{routeId:string}>();
  const [data,setData]=useState<Route|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useFocusEffect(useCallback(()=>{
    let alive=true;api<{data:Route}>(`/routes/${routeId}`,{authenticate:false})
      .then(r=>{if(alive){setData(r.data);setError('');}}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Error al consultar el recorrido.');}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[routeId]));
  return <Screen>{loading?<Loading/>:null}{error?<Warning message={error}/>:null}
    {data?<><Title subtitle={`${data.lineCode} · ${directionLabel(data.direction)}`}>{data.startLabel} → {data.endLabel}</Title>
      {data.lineStatus==='suspended'?<Warning message="El servicio de esta línea está suspendido temporalmente."/>:null}
      <RouteMap geometry={data.geometry} stops={data.stops.map(s=>({id:s.stopId,latitude:s.latitude,longitude:s.longitude,name:s.name,code:s.code}))} lineColor={data.lineColorHex}
        onSelectStop={id=>router.push({pathname:'/stops/[stopId]',params:{stopId:String(id)}})}/>
      <Panel><Text style={textStyles.heading}>Paraderos del recorrido</Text><Text style={textStyles.muted}>Orden correspondiente al sentido seleccionado.</Text>
      {data.stops.map(s=><Pressable key={s.routeStopId} accessibilityRole="button" accessibilityLabel={`Ver paradero ${s.code}`} onPress={()=>router.push({pathname:'/stops/[stopId]',params:{stopId:String(s.stopId)}})}
        style={{paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.surface,flexDirection:'row',alignItems:'center',gap:10}}>
        <View style={{backgroundColor:colors.surface,borderRadius:16,minWidth:30,height:30,alignItems:'center',justifyContent:'center'}}><Text style={{fontWeight:'700',color:colors.ink}}>{s.sequence}</Text></View>
        <View style={{flex:1}}><Text style={textStyles.heading}>{s.name}</Text><Text style={textStyles.muted}>{s.code}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.primary}/>
      </Pressable>)}
      </Panel>
    </>:null}
  </Screen>;
}
