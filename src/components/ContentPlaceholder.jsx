import {useEffect,useState,useSyncExternalStore} from 'react'
import {getPendingRequests,subscribePendingRequests} from '../lib/api.js'
import SiteName from './SiteName.jsx'
import '../styles/loading.css'

export default function ContentPlaceholder({className='',floating=false}){
 return <div role="status" className={`site-loader ${floating?'site-loader-floating':'site-loader-inline'} ${className}`}>
  <span className="site-loader-brand"><SiteName logo/></span>
  <span className="site-loader-track" aria-hidden="true"><span/></span>
  <span className="sr-only">Loading</span>
 </div>
}

export function NetworkLoadingIndicator(){
 const pending=useSyncExternalStore(subscribePendingRequests,getPendingRequests)>0
 const [show,setShow]=useState(false)
 useEffect(()=>{
  if(!pending){setShow(false);return}
  const timer=window.setTimeout(()=>setShow(true),450)
  return()=>window.clearTimeout(timer)
 },[pending])
 return pending&&show?<ContentPlaceholder floating/>:null
}
