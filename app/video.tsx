import React, { useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

const configuredBase = process.env.EXPO_PUBLIC_EDIT_API_URL?.trim() || "";
const API = /^https:\/\//i.test(configuredBase)
  ? configuredBase.replace(/\/$/, "") + "/api/v1/video"
  : "/api/v1/video";
type Job = { id: string; status: string; output?: string[]; failure?: string };
export default function VideoStudio() {
 const router=useRouter();
 const [prompt,setPrompt]=useState("");
 const [imageUrl,setImageUrl]=useState("");
 const [ratio,setRatio]=useState("1280:720");
 const [duration,setDuration]=useState(5);
 const [job,setJob]=useState<Job|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [mode,setMode]=useState<"text"|"image">("text");
 async function generate(){
  if (!/^https:\/\//i.test(API) && process.env.EXPO_OS !== "web") {setError("Configura EXPO_PUBLIC_EDIT_API_URL con la URL HTTPS del servidor Expo antes de probar en TestFlight.");return;}
  setBusy(true);setError("");setJob(null);
  try {
   const response=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt,mode,imageUrl,ratio,duration})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"No se pudo generar.");
   setJob({id:data.id,status:"PENDING"});
  }catch(e){setError(e instanceof Error?e.message:"Error de conexión");}finally{setBusy(false);}
 }
 async function refresh(){
  if(!job)return;
  setBusy(true);setError("");
  try{
   const response=await fetch(API+"?id="+encodeURIComponent(job.id));
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"No se pudo consultar el video.");
   setJob({id:job.id,status:data.status,output:data.output,failure:data.failure});
  }catch(e){setError(e instanceof Error?e.message:"Error de conexión");}finally{setBusy(false);}
 }
 const ready=prompt.trim().length>=3&&(mode==="text"||/^https:\/\//.test(imageUrl.trim()));
 return <ScrollView style={s.page} contentContainerStyle={s.content}>
  <TouchableOpacity onPress={()=>router.back()}><Text style={s.link}>← Volver al editor</Text></TouchableOpacity>
  <Text style={s.heading}>AI Video Studio</Text><Text style={s.sub}>Crea clips con Runway. Une varios clips para historias largas.</Text>
  <View style={s.row}>{(["text","image"] as const).map(m=><TouchableOpacity key={m} style={[s.chip,mode===m&&s.active]} onPress={()=>setMode(m)}><Text style={s.white}>{m==="text"?"Texto a video":"Imagen a video"}</Text></TouchableOpacity>)}</View>
  <Text style={s.label}>Describe el video</Text>
  <TextInput style={[s.input,s.multiline]} multiline placeholder="Una fresa animada camina por una ciudad futurista..." placeholderTextColor="#8891a4" value={prompt} onChangeText={setPrompt} maxLength={1000}/>
  {mode==="image"&&<><Text style={s.label}>URL pública HTTPS de imagen de referencia</Text><TextInput style={s.input} autoCapitalize="none" placeholder="https://..." placeholderTextColor="#8891a4" value={imageUrl} onChangeText={setImageUrl}/><Text style={s.note}>Para esta primera versión, usa una imagen alojada públicamente. No se aceptan archivos locales todavía.</Text></>}
  <Text style={s.label}>Formato</Text><View style={s.row}>{["1280:720","720:1280"].map(r=><TouchableOpacity key={r} style={[s.chip,ratio===r&&s.active]} onPress={()=>setRatio(r)}><Text style={s.white}>{r==="1280:720"?"Horizontal 16:9":"Vertical 9:16"}</Text></TouchableOpacity>)}</View>
  <Text style={s.label}>Duración</Text><View style={s.row}>{[5,10].map(n=><TouchableOpacity key={n} style={[s.chip,duration===n&&s.active]} onPress={()=>setDuration(n)}><Text style={s.white}>{n} segundos</Text></TouchableOpacity>)}</View>
  <Text style={s.note}>Runway cobra por generación. Confirma el precio vigente en tu cuenta antes de continuar. La API necesita RUNWAYML_API_SECRET en el servidor.</Text>
  <TouchableOpacity disabled={!ready||busy} style={[s.button,(!ready||busy)&&s.disabled]} onPress={generate}><Text style={s.buttonText}>{busy?"Procesando...":"Generar video"}</Text></TouchableOpacity>
  {busy&&<ActivityIndicator color="#9a83ff" style={{marginTop:16}}/>}
  {!!error&&<Text style={s.error}>{error}</Text>}
  {job&&<View style={s.panel}><Text style={s.label}>Estado: {job.status}</Text><Text style={s.note}>ID: {job.id}</Text>
   {job.status!=="SUCCEEDED"&&job.status!=="FAILED"&&job.status!=="CANCELED"&&<TouchableOpacity style={s.chip} onPress={refresh} disabled={busy}><Text style={s.white}>Actualizar estado</Text></TouchableOpacity>}
   {job.status==="SUCCEEDED"&&job.output?.map((url,i)=><TouchableOpacity key={i} style={s.button} onPress={()=>Linking.openURL(url)}><Text style={s.buttonText}>Abrir video {i+1}</Text></TouchableOpacity>)}
   {!!job.failure&&<Text style={s.error}>La generación falló. Revisa el prompt o los créditos de Runway.</Text>}
  </View>}
 </ScrollView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:"#0a0d18"},content:{padding:24,paddingTop:55,paddingBottom:70,gap:13},heading:{fontSize:32,fontWeight:"800",color:"#fff"},sub:{fontSize:15,color:"#b5bed2"},link:{color:"#b8a7ff",fontSize:15},label:{color:"#fff",fontWeight:"700",fontSize:15,marginTop:12},input:{backgroundColor:"#181e30",borderWidth:1,borderColor:"#333c56",borderRadius:14,padding:14,color:"#fff",fontSize:15},multiline:{height:135,textAlignVertical:"top"},row:{flexDirection:"row",flexWrap:"wrap",gap:8},chip:{paddingVertical:12,paddingHorizontal:15,borderRadius:12,backgroundColor:"#252d43"},active:{backgroundColor:"#6043ae"},white:{color:"#fff",fontWeight:"600"},note:{color:"#a8b1c5",fontSize:12,lineHeight:19},button:{backgroundColor:"#8260e8",borderRadius:14,padding:16,alignItems:"center",marginTop:10},disabled:{opacity:.45},buttonText:{color:"#fff",fontWeight:"800"},error:{color:"#ff8b9b",marginTop:10},panel:{backgroundColor:"#151c2c",padding:18,borderRadius:16,marginTop:16,gap:12}});
