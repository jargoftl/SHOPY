import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import '../styles/auth-captcha.css'

export default function CaptchaPuzzle({purpose,token,onVerified,disabled=false}) {
 const [challenge,setChallenge]=useState(null),[position,setPosition]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const expires=useRef(null),active=useRef(true),drag=useRef(null)
 useEffect(()=>{active.current=true;return()=>{active.current=false;clearTimeout(expires.current)}},[])
 useEffect(()=>{
  if(token)return
  let current=true;setBusy(true);setError('');setChallenge(null);setPosition(0)
  apiRequest(`/api/auth/captcha?purpose=${purpose}`,{background:true}).then(result=>{if(!current)return;if(result.enabled===false){onVerified('disabled');return}setChallenge(result)}).catch(failure=>{if(current)setError(failure.message)}).finally(()=>{if(current)setBusy(false)})
  return()=>{current=false}
 },[purpose,token,onVerified,revision])
 const movePiece=(event)=>{
  if(!drag.current||disabled||busy)return
  const bounds=event.currentTarget.parentElement.getBoundingClientRect()
  setPosition(Math.max(0,Math.min(240,Math.round((event.clientX-bounds.left-drag.current.offset)/bounds.width*280))))
 }
 const verify=async()=>{
  if(!challenge||busy||disabled)return
  setBusy(true);setError('')
  try{const result=await apiRequest('/api/auth/captcha/verify',{method:'POST',background:true,body:JSON.stringify({id:challenge.id,x:position})});if(!active.current)return;onVerified(result.token);clearTimeout(expires.current);expires.current=setTimeout(()=>{onVerified('');setError('Please complete a fresh puzzle.');},result.expiresInSeconds*1000)}catch(failure){if(active.current)setError(failure.message)}finally{if(active.current)setBusy(false)}
 }
 return <section className={`auth-captcha ${token?'is-verified':''}`} aria-label="Human verification">
  <div className="auth-captcha-heading">{token?<CheckCircle2 size={17}/>:<ShieldCheck size={17}/>}<strong>{token?'Puzzle completed':'A quick human check'}</strong>{!token&&<button type="button" aria-label="Load a new puzzle" disabled={busy||disabled} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={14}/></button>}</div>
  {token?<p>You’re ready to continue.</p>:<><p>Drag the piece into the outlined space. You can also use the slider’s arrow keys.</p>{challenge&&<><div className="auth-puzzle-image"><img src={challenge.background} alt="Small illustrated house with an outlined missing square" draggable="false"/><img className="auth-puzzle-piece" src={challenge.piece} style={{left:`${position/280*100}%`,top:`${challenge.y/160*100}%`}} alt="Movable image piece" draggable="false" onPointerDown={event=>{if(disabled||busy)return;drag.current={offset:event.clientX-event.currentTarget.getBoundingClientRect().left};event.currentTarget.setPointerCapture(event.pointerId)}} onPointerMove={movePiece} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}/></div><label className="auth-puzzle-slider">Slide to fit the piece<input type="range" min="0" max={challenge.max} step="1" value={position} onChange={event=>setPosition(Number(event.target.value))} disabled={busy||disabled} aria-label="Move puzzle piece" aria-valuetext={`${position} of ${challenge.max}`}/></label><button type="button" className="auth-puzzle-check" disabled={busy||disabled} onClick={verify}>{busy?'Checking…':'Check puzzle'}</button></>}{busy&&!challenge&&<p role="status">Preparing your puzzle…</p>}{error&&<p role="alert" className="auth-puzzle-error">{error}</p>}{!challenge&&!busy&&<button type="button" className="auth-puzzle-check" onClick={()=>setRevision(value=>value+1)}>Try loading again</button>}</>}
 </section>
}
