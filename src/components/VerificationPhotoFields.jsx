import { useEffect, useRef, useState } from 'react'
import { Camera, CreditCard, Upload, X } from 'lucide-react'

const fields=[['id_front','ID front','Keep the photo and text clear and readable.'],['id_back','ID back','Include the full back of the same ID.']]
const asData=(blob)=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('This photo could not be read.'));reader.readAsDataURL(blob)})
export default function VerificationPhotoFields({photos,setPhotos,consent,setConsent,onError,onBusyChange}){
 const [reading,setReading]=useState(null),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;onBusyChange(false)}},[onBusyChange])
 const choose=async(event,kind)=>{
  const file=event.target.files?.[0];event.target.value='';if(!file)return
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){onError('Choose a JPEG, PNG or WebP photo up to 12 MB.');return}
  setReading(kind);onBusyChange(true);onError('')
  try{
   // Re-encode locally to remove camera location metadata and fit private upload limits.
   const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'})
   const ratio=Math.min(1,2200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas')
   canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio)
   const context=canvas.getContext('2d');if(!context)throw new Error('Photo processing is unavailable in this browser. Try another browser.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close()
   let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92))
   if(blob?.size>2*1024*1024)blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8))
   if(!blob||blob.size>2*1024*1024)throw new Error('This photo is too large. Crop it clearly and try again.')
   const data=await asData(blob)
   if(alive.current)setPhotos(current=>({...current,[kind]:{type:blob.type,data}}))
  }catch(error){if(alive.current)onError(error.message||'Choose a readable image and try again.')}
  finally{if(alive.current){setReading(null);onBusyChange(false)}}
 }
 return <fieldset className="min-w-0 rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-4 sm:p-5"><legend className="px-2 text-sm font-semibold text-[#111111]">Private identity verification</legend><div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map(([kind,title,hint])=><div key={kind} className="min-w-0 rounded-xl border border-[#e5e5e5] bg-white p-3"><div className="mb-3 flex min-h-28 items-center justify-center overflow-hidden rounded-lg bg-[#f7f7f7]">{photos[kind]?<img src={`data:${photos[kind].type};base64,${photos[kind].data}`} alt={`${title} preview`} className="h-28 w-full object-contain"/>:<CreditCard className="text-[#777777]" size={29} strokeWidth={1.4}/>}</div><p className="text-xs font-semibold text-[#111111]">{title}</p><p className="mt-1 min-h-10 text-[10px] leading-5 text-[#777777]">{hint}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">
  {[['camera','Take photo',Camera,'environment'],['gallery','Upload from gallery',Upload,undefined]].map(([source,label,Icon,capture])=><label key={source} className="flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#cccccc] px-2 py-1.5 text-center text-xs font-medium text-[#555555] focus-within:ring-2 focus-within:ring-slate-500">
   <Icon size={14} className="shrink-0" aria-hidden="true"/>{label}
   <input type="file" accept="image/jpeg,image/png,image/webp" capture={capture} aria-label={`${label} for ${title.toLowerCase()}`} disabled={Boolean(reading)} onChange={event=>choose(event,kind)} className="sr-only"/>
  </label>)}
 </div>{reading===kind&&<p role="status" className="mt-2 text-xs">Preparing photo…</p>}{photos[kind]&&<button type="button" onClick={()=>setPhotos(current=>({...current,[kind]:null}))} disabled={Boolean(reading)} className="mt-2 flex items-center gap-1 text-[10px] text-[#555555]"><X size={11}/>Remove photo</button>}</div>)}</div><p className="mt-3 text-[10px] leading-5 text-[#777777]">Both ID photos are required. Check that the ID details remain readable in the previews. Phone cameras can take photos directly.</p><label className="mt-4 flex items-start gap-2 text-xs leading-6 text-[#555555]"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} className="mt-1.5 accent-[#111111]"/>I consent to identity verification using my photos and phone number.</label></fieldset>
}
