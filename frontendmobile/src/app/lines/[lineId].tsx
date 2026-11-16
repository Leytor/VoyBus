import React,{useCallback,useState} from 'react';
import {Text,Pressable,View} from 'react-native';
import {router,useLocalSearchParams,useFocusEffect} from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {ActionButton,Loading,Panel,Screen,Title,Warning,textStyles} from '../../components/UI';
import {api,directionLabel} from '../../lib/api';
import {Line,RouteOverview} from '../../lib/types';
import {colors} from '../../lib/theme';
const DAYS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
export default function LineDetail(){
  const {lineId}=useLocalSearchParams<{lineId:string}>();
  const [line,setLine]=useState<Line|null>(null),[routes,setRoutes]=useState<RouteOverview[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useFocusEffect(useCallback(()=>{
    let active=true;
    Promise.all([api<{data:Line}>(`/lines/${lineId}`,{authenticate:false}),api<{data:RouteOverview[]}>(`/lines/${lineId}/routes`,{authenticate:false})])
      .then(([a,b])=>{if(active){setLine(a.data);setRoutes(b.data);setError('');}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'No se pudo cargar.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[lineId]));
  return <Screen>{loading?<Loading/>:null}{error?<Warning message={error}/>:null}{line?<>
    <Title subtitle={line.name}>{line.code}</Title>
    {line.status==='suspended'?<Warning message="Esta línea se encuentra temporalmente suspendida."/>:null}
    <Panel><Text style={textStyles.heading}>Sentidos disponibles</Text><Text style={textStyles.muted}>Selecciona un recorrido para ver el mapa y sus paraderos ordenados.</Text></Panel>
    {routes.map(r=><Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`Ver recorrido ${directionLabel(r.direction)}`} onPress={()=>router.push({pathname:'/routes/[routeId]',params:{routeId:String(r.id)}})}><Panel>
      <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{color:colors.primary,fontWeight:'800',fontSize:17}}>{directionLabel(r.direction)}</Text><Ionicons name="chevron-forward" color={colors.primary} size={20}/></View>
      <Text style={textStyles.body}>{r.startLabel} → {r.endLabel}</Text>
      <Text style={textStyles.muted}>Horario: {r.startTimeLocal}–{r.endTimeLocal}</Text>
      <Text style={textStyles.muted}>Días: {r.serviceDays.map(n=>DAYS[n-1]||String(n)).join(' · ')}</Text>
    </Panel></Pressable>)}
    {!routes.length?<Panel><Text style={textStyles.muted}>Esta línea no tiene recorridos habilitados.</Text></Panel>:null}
    <ActionButton label="Ver todos los paraderos" variant="outline" onPress={()=>router.push('/stops')}/>
  </>:null}</Screen>;
}
