import React from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import {colors} from '../lib/theme';

type ButtonProps={label:string;onPress:()=>void;variant?:'primary'|'secondary'|'outline'|'danger';disabled?:boolean;icon?:React.ComponentProps<typeof Ionicons>['name']};
export function ActionButton({label,onPress,variant='primary',disabled=false,icon}:ButtonProps){
  const background=variant==='primary'?colors.primary:variant==='secondary'?colors.blue:variant==='danger'?colors.danger:colors.white;
  const textColor=variant==='outline'?colors.primary:colors.white;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.button,{backgroundColor:background,borderColor:variant==='outline'?colors.primary:background,opacity:disabled ? 0.5 : pressed ? 0.85 : 1}]}>
    {icon?<Ionicons name={icon} size={19} color={textColor}/>:null}<Text style={[styles.buttonLabel,{color:textColor}]}>{label}</Text>
  </Pressable>;
}
export function Screen({children}:{children:React.ReactNode}){return <SafeAreaView edges={['bottom']} style={styles.screen}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView></SafeAreaView>;}
export function Title({children,subtitle}:{children:React.ReactNode;subtitle?:string}){return <View style={{marginBottom:14}}><Text style={styles.title}>{children}</Text>{subtitle?<Text style={styles.subtitle}>{subtitle}</Text>:null}</View>;}
export function Panel({children}:{children:React.ReactNode}){return <View style={styles.panel}>{children}</View>;}
export function Warning({message}:{message:string}){return <View style={styles.warning}><Ionicons name="alert-circle-outline" size={19} color={colors.danger}/><Text style={{color:colors.ink,flex:1}}>{message}</Text></View>;}
export function Notice({message}:{message:string}){return <View style={styles.notice}><Ionicons name="information-circle-outline" size={20} color={colors.blue}/><Text style={{color:colors.ink,flex:1}}>{message}</Text></View>;}
export function Loading(){return <View style={{padding:22}}><ActivityIndicator size="large" color={colors.primary} accessibilityLabel="Cargando"/></View>;}
export function TextField({value,onChangeText,placeholder,secureTextEntry,keyboardType,label}: {value:string;onChangeText:(v:string)=>void;placeholder:string;secureTextEntry?:boolean;keyboardType?:'default'|'email-address';label:string}){
  return <View style={{marginBottom:13}}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize={keyboardType==='email-address'?'none':'sentences'} keyboardType={keyboardType||'default'} secureTextEntry={secureTextEntry} style={styles.input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#6B7280" /></View>;
}
export function Divider(){return <View style={{height:1,backgroundColor:colors.border,marginVertical:9}}/>;}
export const textStyles={muted:{color:colors.textMuted,fontSize:14} as const,body:{color:colors.ink,fontSize:15} as const,heading:{fontSize:17,fontWeight:'700' as const,color:colors.ink}};
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.background},content:{padding:18,paddingBottom:32},
  title:{fontSize:25,fontWeight:'800',color:colors.ink},subtitle:{marginTop:5,color:colors.textMuted,fontSize:14},
  panel:{backgroundColor:colors.white,borderColor:colors.border,borderWidth:1,borderRadius:15,padding:16,marginBottom:13,gap:9},
  button:{borderRadius:11,borderWidth:1,minHeight:48,paddingHorizontal:14,paddingVertical:11,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,marginVertical:3},
  buttonLabel:{fontSize:15,fontWeight:'700',textAlign:'center'},
  warning:{flexDirection:'row',gap:10,alignItems:'flex-start',backgroundColor:'#FFF2EF',borderColor:'#F5C2BB',borderWidth:1,padding:12,borderRadius:10,marginBottom:12},
  notice:{flexDirection:'row',gap:10,alignItems:'flex-start',backgroundColor:'#EFF6FF',padding:12,borderRadius:10,marginBottom:12},
  label:{color:colors.ink,fontSize:14,fontWeight:'700',marginBottom:5},
  input:{backgroundColor:colors.white,borderColor:colors.border,borderWidth:1,borderRadius:10,minHeight:48,paddingHorizontal:13,color:colors.ink,fontSize:16},
});
