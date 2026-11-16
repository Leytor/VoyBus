import React from 'react';
import {View,Text} from 'react-native';
import MapView,{Marker,Polyline} from 'react-native-maps';
import {colors} from '../lib/theme';
export type Point={latitude:number;longitude:number;name?:string;code?:string;id?:number};
export function RouteMap({geometry=[],stops=[],lineColor=colors.primary,onSelectStop}: {geometry?:Point[];stops?:Point[];lineColor?:string;onSelectStop?:(stopId:number)=>void}){
  const pts=geometry.length?geometry:stops;
  if(!pts.length)return <Text style={{color:colors.textMuted}}>No hay coordenadas disponibles.</Text>;
  const avg=pts.reduce((a,p)=>({latitude:a.latitude+p.latitude,longitude:a.longitude+p.longitude}),{latitude:0,longitude:0});
  const latitudes=pts.map(p=>p.latitude),longitudes=pts.map(p=>p.longitude);
  const region={latitude:avg.latitude/pts.length,longitude:avg.longitude/pts.length,
    latitudeDelta:Math.max(.015,(Math.max(...latitudes)-Math.min(...latitudes))*1.5),longitudeDelta:Math.max(.015,(Math.max(...longitudes)-Math.min(...longitudes))*1.5)};
  return <View style={{height:260,borderRadius:14,overflow:'hidden',marginBottom:10}}>
    <MapView style={{flex:1}} initialRegion={region} accessibilityLabel="Mapa del recorrido">
      {geometry.length>1?<Polyline coordinates={geometry} strokeColor={lineColor} strokeWidth={4}/>:null}
      {stops.map((s,i)=><Marker key={`${s.id??i}`} coordinate={{latitude:s.latitude,longitude:s.longitude}} title={s.name||'Paradero'} description={s.code} pinColor={lineColor} onPress={()=>s.id&&onSelectStop?.(s.id)}/>) }
    </MapView>
  </View>;
}
