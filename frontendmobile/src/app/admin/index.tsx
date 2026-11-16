import React from 'react';
import {ActivityIndicator,View} from 'react-native';
import {Redirect} from 'expo-router';
import {AdminShiftsScreen} from '../../features/martin-index';
import {useAuth} from '../../contexts/AuthContext';
export default function Route() {
  const {actor,ready}=useAuth();
  if(!ready)return <View style={{flex:1,alignItems:'center',justifyContent:'center'}}><ActivityIndicator /></View>;
  if(actor?.actorType!=='user'||actor.user.role!=='admin') return <Redirect href="/sign-in" />;
  return <AdminShiftsScreen/>;
}
