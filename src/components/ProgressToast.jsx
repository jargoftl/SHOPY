import {useEffect,useState} from 'react'
import {CheckCircle2,X} from 'lucide-react'
export const progressToast=message=>window.dispatchEvent(new CustomEvent('shipment-toast',{detail:message}))
export default function ProgressToast(){
 const [message,setMessage]=useState('')
 useEffect(()=>{let timer;const show=event=>{setMessage(event.detail);clearTimeout(timer);timer=setTimeout(()=>setMessage(''),5500)};window.addEventListener('shipment-toast',show);return()=>{clearTimeout(timer);window.removeEventListener('shipment-toast',show)}},[])
 return message?<aside role="status" aria-live="polite" className="fixed right-4 top-5 z-[100] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-black shadow-xl"><CheckCircle2 size={21}/><span>{message}</span><button type="button" aria-label="Dismiss notification" onClick={()=>setMessage('')}><X size={17}/></button></aside>:null
}
