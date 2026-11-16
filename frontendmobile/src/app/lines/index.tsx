import React,{useCallback,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {useFocusEffect,router} from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {Loading,Panel,Screen,TextField,Title,Warning,textStyles} from '../../components/UI';
import {api} from '../../lib/api';
import {Line,Page} from '../../lib/types';
import {colors} from '../../lib/theme';
export default function Lines(){
  const [search,setSearch]=useState(''),[items,setItems]=useState<Line[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useFocusEffect(useCallback(()=>{
    let active=true;
    const timer=setTimeout(async()=>{
      try{const r=await api<Page<Line>>(`/lines?search=${encodeURIComponent(search)}&pageSize=100`,{authenticate:false});if(active){setItems(r.data);setError('');}}
      catch(e){if(active)setError(e instanceof Error?e.message:'Error al consultar líneas.');}
      finally{if(active)setLoading(false);}
    },250);
    return()=>{active=false;clearTimeout(timer);};
  },[search]));
  return <Screen><Title subtitle="Busca líneas por su código o nombre.">Red de transporte</Title>
    <TextField label="Buscar línea" placeholder="Ej.: DEMO-01" value={search} onChangeText={v=>{setSearch(v);setLoading(true);}}/>
    {error?<Warning message={error}/>:null}{loading?<Loading/>:items.length===0?<Panel><Text style={textStyles.muted}>No se encontraron líneas.</Text></Panel>:null}
    {items.map(line=><Pressable key={line.id} accessibilityRole="button" accessibilityLabel={`Ver línea ${line.code}`} onPress={()=>router.push({pathname:'/lines/[lineId]',params:{lineId:String(line.id)}})}>
      <Panel><View style={{flexDirection:'row',gap:11,alignItems:'center'}}><View style={{width:10,height:45,borderRadius:5,backgroundColor:line.colorHex}}/>
        <View style={{flex:1}}><Text style={textStyles.heading}>{line.code} · {line.name}</Text>
          <Text style={textStyles.muted}>{line.startLabel||'Sin origen'} → {line.endLabel||'Sin destino'}</Text>
          {line.status==='suspended'?<Text style={{color:colors.danger,fontWeight:'700'}}>Servicio temporalmente suspendido</Text>:<Text style={{color:colors.success}}>En catálogo</Text>}
        </View><Ionicons name="chevron-forward" color={colors.primary} size={22}/>
      </View></Panel></Pressable>)}
  </Screen>;
}
