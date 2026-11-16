import React,{useState} from 'react';
import {Text} from 'react-native';
import {router} from 'expo-router';
import {ActionButton,Panel,Screen,TextField,Title,Warning,textStyles} from '../components/UI';
import {useAuth} from '../contexts/AuthContext';
export default function SignIn(){
  const {signIn,ensureGuest}=useAuth();
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const login=async()=>{setBusy(true);setError('');try{await signIn(email.trim(),password);router.replace('/');}catch(e){setError(e instanceof Error?e.message:'No se pudo iniciar sesión.');}finally{setBusy(false);}};
  const guest=async()=>{setBusy(true);setError('');try{await ensureGuest();router.replace('/connect');}catch(e){setError(e instanceof Error?e.message:'No se pudo iniciar como invitado.');}finally{setBusy(false);}};
  return <Screen><Title subtitle="Accede con tu cuenta de pasajero, conductor o administrador.">Iniciar sesión</Title>
    {error?<Warning message={error}/>:null}
    <Panel><TextField label="Correo electrónico" keyboardType="email-address" placeholder="usuario@correo.cl" value={email} onChangeText={setEmail}/>
      <TextField label="Contraseña" placeholder="Tu contraseña" secureTextEntry value={password} onChangeText={setPassword}/>
      <ActionButton label={busy?'Ingresando...':'Ingresar'} disabled={busy||!email||!password} onPress={()=>{void login();}}/>
    </Panel>
    <Panel><Text style={textStyles.heading}>¿No tienes cuenta?</Text><Text style={textStyles.muted}>Puedes consultar líneas sin entrar y solicitar una parada como invitado.</Text>
      <ActionButton label="Continuar como invitado" variant="secondary" disabled={busy} onPress={()=>{void guest();}}/></Panel>
  </Screen>;
}
