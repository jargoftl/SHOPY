import {useEffect,useRef,useState} from 'react'
import {deliveryEstimate} from '../lib/deliveryEstimate.js'
import {progressToast} from './ProgressToast.jsx'
export default function DeliveryEstimate({createdAt,status}){
 const [now,setNow]=useState(Date.now),last=useRef(null),estimate=deliveryEstimate(createdAt,now)
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[])
 const stage=estimate?.stage,label=estimate?.label
 useEffect(()=>{if(stage===undefined)return;if(last.current!==null&&last.current!==stage)progressToast(`Delivery estimate: ${label}`);last.current=stage},[stage,label])
 if(!estimate||['delivered','hold','stalled'].includes(status))return null
 return <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-xs"><p className="font-semibold">Automatic 3-day estimate</p><p className="mt-2">{estimate.label}</p><p className="mt-2 text-gray-500">Estimated from the order date. Actual dispatch and delivery require confirmation; this timer does not confirm receipt.</p></div>
}
