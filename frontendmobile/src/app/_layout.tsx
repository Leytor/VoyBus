import React from 'react';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {AuthProvider} from '../contexts/AuthContext';
import {colors} from '../lib/theme';
import {API_BASE,getToken} from '../lib/api';
import {createMartinApi,MartinApiProvider} from '../features/martin-index';
const martinApi = createMartinApi({baseUrl:`${API_BASE}/api/v1`,getToken});
export default function RootLayout(){return <AuthProvider><MartinApiProvider api={martinApi}><StatusBar style="light"/><Stack screenOptions={{headerStyle:{backgroundColor:colors.primary},headerTintColor:colors.white,headerTitleStyle:{fontWeight:'700'},contentStyle:{backgroundColor:colors.background}}}>
  <Stack.Screen name="index" options={{title:'VoyBus'}}/>
  <Stack.Screen name="lines/index" options={{title:'Líneas'}}/>
  <Stack.Screen name="lines/[lineId]" options={{title:'Recorridos de línea'}}/>
  <Stack.Screen name="routes/[routeId]" options={{title:'Detalle de recorrido'}}/>
  <Stack.Screen name="stops/index" options={{title:'Paraderos'}}/>
  <Stack.Screen name="stops/[stopId]" options={{title:'Detalle del paradero'}}/>
  <Stack.Screen name="favorites" options={{title:'Mis favoritos'}}/>
  <Stack.Screen name="connect" options={{title:'Vincular vehículo'}}/>
  <Stack.Screen name="trip" options={{title:'Mi viaje'}}/>
  <Stack.Screen name="sign-in" options={{title:'Iniciar sesión'}}/>
  <Stack.Screen name="vehicles/index" options={{title:'Vehículos activos'}}/>
  <Stack.Screen name="driver/index" options={{title:'Turnos del conductor'}}/>
  <Stack.Screen name="driver/trip/[tripId]" options={{title:'Viaje del conductor'}}/>
  <Stack.Screen name="admin/index" options={{title:'Administrar turnos'}}/>
  <Stack.Screen name="admin/shift" options={{title:'Editar turno'}}/>
</Stack></MartinApiProvider></AuthProvider>;}
