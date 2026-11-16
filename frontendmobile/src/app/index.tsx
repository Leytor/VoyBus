import React from 'react';
import {Text,View} from 'react-native';
import {router} from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {ActionButton,Notice,Panel,Screen,Title,textStyles} from '../components/UI';
import {useAuth} from '../contexts/AuthContext';
import {colors} from '../lib/theme';
export default function Home(){
  const {actor,ready,signOut}=useAuth();
  const role=actor?.actorType==='guest'?'Invitado':actor?.actorType==='user'?actor.user.fullName:'Sin sesión';
  return <Screen><Title subtitle="Transporte público · consulta y solicitud digital de parada">VoyBus</Title>
    <Panel><View style={{flexDirection:'row',alignItems:'center',gap:10}}><Ionicons name="bus-outline" size={32} color={colors.primary}/><View style={{flex:1}}><Text style={textStyles.heading}>Tu recorrido, más claro</Text><Text style={textStyles.muted}>Consulta líneas, encuentra paraderos y avisa dónde bajar.</Text></View></View></Panel>
    <Panel><Text style={textStyles.heading}>Explorar la red</Text><ActionButton label="Ver líneas y recorridos" icon="git-branch-outline" onPress={()=>router.push('/lines')}/><ActionButton label="Buscar paraderos" icon="location-outline" variant="secondary" onPress={()=>router.push('/stops')}/></Panel>
    <Panel><Text style={textStyles.heading}>Vehículos en circulación</Text>
      <ActionButton label="Ver vehículos activos" icon="bus-outline" variant="secondary" onPress={()=>router.push('/vehicles')}/>
    </Panel>
    {actor?.actorType==='user'&&actor.user.role==='driver'?<Panel><Text style={textStyles.heading}>Conductor</Text>
      <ActionButton label="Mis turnos y viajes" icon="navigate-outline" onPress={()=>router.push('/driver')}/>
    </Panel>:null}
    {actor?.actorType==='user'&&actor.user.role==='admin'?<Panel><Text style={textStyles.heading}>Administración</Text>
      <ActionButton label="Gestionar turnos" icon="calendar-outline" onPress={()=>router.push('/admin')}/>
    </Panel>:null}
    <Panel><Text style={textStyles.heading}>Durante tu viaje</Text><ActionButton label="Escanear QR o ingresar código" icon="qr-code-outline" onPress={()=>router.push('/connect')}/><ActionButton label="Consultar mi solicitud" icon="navigate-outline" variant="outline" onPress={()=>router.push('/trip')}/></Panel>
    <Panel><Text style={textStyles.heading}>Cuenta</Text><Text style={textStyles.muted}>{ready?role:'Comprobando sesión...'}</Text>
      {actor?.actorType==='user'&&actor.user.role==='passenger'?<ActionButton label="Paraderos favoritos" variant="outline" icon="star-outline" onPress={()=>router.push('/favorites')}/>:null}
      {actor?<ActionButton label="Cerrar sesión" variant="outline" onPress={()=>{void signOut();}}/>:<ActionButton label="Iniciar sesión de pasajero" variant="outline" icon="log-in-outline" onPress={()=>router.push('/sign-in')}/>}
    </Panel>
    <Notice message="Los recorridos y paraderos incluidos en esta versión son datos ficticios para demostrar el sistema; no representan información oficial del transporte."/>
  </Screen>;
}
