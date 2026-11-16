import React,{useCallback,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {Loading,Panel,Screen,TextField,Title,Warning,textStyles} from '../../components/UI';
import {RouteMap} from '../../components/RouteMap';
import {api} from '../../lib/api';
import {Page,Stop} from '../../lib/types';
import {colors} from '../../lib/theme';
export default function Stops(){
  const [query,setQuery]=useState(''),[list,setList]=useState<Stop[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useFocusEffect(useCallback(()=>{
    let alive=true;
    const timer=setTimeout(()=>{api<Page<Stop>>(`/stops?search=${encodeURIComponent(query)}&pageSize=100`,{authenticate:false})
      .then(r=>{if(alive){setList(r.data);setError('');}}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Error al cargar paraderos.');})
      .finally(()=>{if(alive)setLoading(false);});},250);
    return()=>{alive=false;clearTimeout(timer);};
  },[query]));
  return <Screen><Title subtitle="Explora el mapa o busca por nombre y código.">Paraderos</Title>
    <TextField label="Buscar paradero" placeholder="Ej.: P003" value={query} onChangeText={v=>{setQuery(v);setLoading(true);}}/>
    {error?<Warning message={error}/>:null}{loading?<Loading/>:null}
    {list.length?<RouteMap stops={list.map(s=>({...s}))} onSelectStop={id=>router.push({pathname:'/stops/[stopId]',params:{stopId:String(id)}})}/>:null}
    {!loading&&!list.length?<Panel><Text style={textStyles.muted}>No se encontraron paraderos.</Text></Panel>:null}
    {list.map(stop=><Pressable key={stop.id} accessibilityRole="button" accessibilityLabel={`Ver paradero ${stop.code}`} onPress={()=>router.push({pathname:'/stops/[stopId]',params:{stopId:String(stop.id)}})}>
      <Panel><View style={{flexDirection:'row',alignItems:'center',gap:10}}><Ionicons name="location-outline" size={22} color={colors.primary}/><View style={{flex:1}}><Text style={textStyles.heading}>{stop.name}</Text><Text style={textStyles.muted}>{stop.code}</Text></View><Ionicons name="chevron-forward" color={colors.primary} size={20}/></View></Panel>
    </Pressable>)}
  </Screen>;
}
