const BASE="https://api.dev.runwayml.com/v1";
const VERSION="2024-11-06";
const json=(value:Record<string,unknown>,status=200)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
function headers(){return {"Authorization":"Bearer "+process.env.RUNWAYML_API_SECRET,"X-Runway-Version":VERSION,"Content-Type":"application/json"};}
function validId(id:string){return /^[a-zA-Z0-9_-]{8,100}$/.test(id);}
export async function POST(request:Request){
 if(!process.env.RUNWAYML_API_SECRET)return json({error:"Configura RUNWAYML_API_SECRET en el servidor."},503);
 let body:any;
 try{body=await request.json();}catch{return json({error:"JSON inválido."},400);}
 const {prompt,mode,ratio,duration,imageUrl}=body||{};
 if(typeof prompt!=="string"||prompt.trim().length<3||prompt.length>1000||![5,10].includes(duration)||!["1280:720","720:1280"].includes(ratio)||!["text","image"].includes(mode))return json({error:"Parámetros inválidos."},400);
 if(mode==="image"&&(typeof imageUrl!=="string"||!/^https:\/\//i.test(imageUrl)||imageUrl.length>2000))return json({error:"Usa una URL HTTPS de imagen válida."},400);
 // API credentials remain on the server; never ship them to the app.
 const path=mode==="image"?"/image_to_video":"/text_to_video";
 const payload=mode==="image"?{model:"gen4_turbo",promptImage:imageUrl,promptText:prompt,ratio,duration}:{model:"gen4.5",promptText:prompt,ratio,duration};
 try{
  const upstream=await fetch(BASE+path,{method:"POST",headers:headers(),body:JSON.stringify(payload)});
  const result=await upstream.json();
  if(!upstream.ok)return json({error:upstream.status===402?"Créditos insuficientes en Runway.":upstream.status===429?"Límite de solicitudes alcanzado.":"Runway rechazó la solicitud. Comprueba modelo, formato y acceso a la API."},upstream.status>=500?502:upstream.status);
  return json({id:result.id},202);
 }catch{return json({error:"No se pudo conectar con Runway."},502);}
}
export async function GET(request:Request){
 if(!process.env.RUNWAYML_API_SECRET)return json({error:"API no configurada."},503);
 const id=new URL(request.url).searchParams.get("id")||"";
 if(!validId(id))return json({error:"ID inválido."},400);
 try{
  const upstream=await fetch(BASE+"/tasks/"+encodeURIComponent(id),{headers:headers()});
  if(!upstream.ok)return json({error:"No se pudo consultar la tarea."},upstream.status>=500?502:upstream.status);
  const data=await upstream.json();
  return json({status:data.status,output:Array.isArray(data.output)?data.output:[],failure:data.failure?String(data.failure):undefined});
 }catch{return json({error:"No se pudo consultar Runway."},502);}
}
