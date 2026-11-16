import React,{useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
import {router} from 'expo-router';
import {ActionButton,Panel,Screen,TextField,Title,Warning,textStyles} from '../components/UI';
import {api,directionLabel,qrVehicleCode} from '../lib/api';
import {VehicleResolution,TripLink} from '../lib/types';
import {useAuth} from '../contexts/AuthContext';
import {colors} from '../lib/theme';
export default function Connect(){
  const {ensureGuest,actor}=useAuth();
  const [code,setCode]=useState(''),[vehicle,setVehicle]=useState<VehicleResolution|null>(null),[scanning,setScanning]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [permission,requestPermission]=useCameraPermissions();
  const resolve=async(input:string)=>{
    const clean=qrVehicleCode(input);
    if(!clean){setError('Código no válido. Ingresa VB-010 o escanea un QR VoyBus.');setVehicle(null);return;}
    setCode(clean);setBusy(true);setError('');
    try{const r=await api<{data:VehicleResolution}>(`/vehicles/resolve/${encodeURIComponent(clean)}`,{authenticate:false});setVehicle(r.data);}
    catch(e){setVehicle(null);setError(e instanceof Error?e.message:'No se encontró un viaje activo.');}
    finally{setBusy(false);setScanning(false);}
  };
  const connect=async()=>{
    if(!vehicle)return;
    setBusy(true);setError('');
    try{await ensureGuest();const result=await api<{data:TripLink}>('/trip-links',{method:'POST',body:{vehicleCode:vehicle.vehicle.code}});
      if(result.data)router.replace('/trip');
    }catch(e){setError(e instanceof Error?e.message:'No se pudo vincular el viaje.');}
    finally{setBusy(false);}
  };
  return <Screen><Title subtitle="Confirma la línea y el sentido antes de vincularte.">Vincular un vehículo</Title>
    {error?<Warning message={error}/>:null}
    {scanning?<Panel>
      {!permission?.granted?<><Text style={textStyles.body}>La cámara necesita permiso para leer el código QR.</Text>
        <ActionButton label="Permitir cámara" onPress={()=>{void requestPermission();}}/>
      </>:<View style={{height:290,overflow:'hidden',borderRadius:12}}><CameraView style={{flex:1}} facing="back" barcodeScannerSettings={{barcodeTypes:['qr']}}
        onBarcodeScanned={({data})=>{setScanning(false);void resolve(data);}}/></View>}
      <ActionButton label="Cancelar escaneo" variant="outline" onPress={()=>setScanning(false)}/>
    </Panel>:<Panel>
      <ActionButton label="Escanear código QR" icon="qr-code-outline" variant="secondary" onPress={()=>setScanning(true)}/>
      <Text style={textStyles.muted}>O ingresa el código que aparece dentro del vehículo:</Text>
      <TextField label="Código del vehículo" placeholder="Ej.: VB-010" value={code} onChangeText={v=>{setCode(v);setVehicle(null);}}/>
      <ActionButton label={busy?'Buscando...':'Comprobar vehículo'} disabled={busy||!code.trim()} onPress={()=>{void resolve(code);}}/>
    </Panel>}
    {vehicle?<Panel><Text style={textStyles.heading}>Vehículo encontrado</Text>
      <Text style={textStyles.body}>Código: {vehicle.vehicle.code}</Text>
      <Text style={textStyles.body}>Línea: {vehicle.trip.lineCode} · {vehicle.trip.lineName}</Text>
      <Text style={textStyles.body}>Sentido: {directionLabel(vehicle.trip.direction)}</Text>
      <Text style={{color:colors.success,fontWeight:'700'}}>Viaje activo</Text>
      <ActionButton label={busy?'Vinculando...':'Confirmar vinculación'} disabled={busy} onPress={()=>{void connect();}}/>
    </Panel>:null}
    <Panel><Text style={textStyles.muted}>Puedes vincularte como pasajero registrado o invitado. Un código QR solo identifica el vehículo; no permite omitir las validaciones del servidor.</Text></Panel>
  </Screen>;
}
