import React,{useCallback,useState} from 'react';
import {Text,Pressable} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {ActionButton,Loading,Panel,Screen,Title,Warning,textStyles} from '../components/UI';
import {api} from '../lib/api';
import {Stop} from '../lib/types';
import {useAuth} from '../contexts/AuthContext';
import {colors} from '../lib/theme';
export default function Favorites(){
  const {actor}=useAuth(),registered=actor?.actorType==='user'&&actor.user.role==='passenger';
  const [items,setItems]=useState<Stop[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useFocusEffect(useCallback(()=>{
    if(!registered){setLoading(false);return;}
    let alive=true;
    api<{data:Stop[]}>('/me/favorite-stops').then(r=>{if(alive){setItems(r.data);setError('');}})
      .catch(e=>{if(alive)setError(e instanceof Error?e.message:'No se pudo cargar favoritos.');}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[registered]));
  return <Screen><Title subtitle="Se conservan entre sesiones de tu cuenta.">Mis paraderos favoritos</Title>
    {!registered?<Panel><Text style={textStyles.muted}>Los favoritos requieren una cuenta de pasajero.</Text><ActionButton label="Iniciar sesión" onPress={()=>router.push('/sign-in')}/></Panel>:null}
    {loading?<Loading/>:null}{error?<Warning message={error}/>:null}
    {registered&&!loading&&!items.length?<Panel><Text style={textStyles.muted}>Todavía no tienes paraderos favoritos.</Text></Panel>:null}
    {items.map(s=><Pressable key={s.id} accessibilityRole="button" onPress={()=>router.push({pathname:'/stops/[stopId]',params:{stopId:String(s.id)}})}><Panel><Text style={{fontSize:16,fontWeight:'700',color:colors.ink}}>{s.name}</Text><Text style={textStyles.muted}>{s.code}</Text></Panel></Pressable>)}
  </Screen>;
}
