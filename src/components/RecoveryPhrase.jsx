import {useEffect,useRef,useState} from 'react'
import {useLocation} from 'react-router-dom'
import {apiRequest} from '../lib/api.js'

export function PhraseGrid({phrase}){
 return <ol className="my-5 grid grid-cols-3 gap-2" aria-label="Recovery words in order">{phrase.split(' ').map((word,i)=><li key={i} className="rounded-lg bg-white/10 px-2 py-3 text-sm"><span className="mr-2 text-xs text-white/50">{String(i+1).padStart(2,'0')}</span>{word}</li>)}</ol>
}
export function PhraseDialog({phrase,onClose,required=false}){
 const dialog=useRef(null),[copied,setCopied]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close()},[])
 const copy=async()=>{try{await navigator.clipboard.writeText(phrase);setCopied(true);setError('')}catch{setError('Clipboard unavailable. Select and copy the phrase below, then confirm you saved it.')}}
 return <dialog ref={dialog} onCancel={e=>{if(required||busy)e.preventDefault();else onClose()}} aria-labelledby="recovery-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-[#101010] p-6 text-white shadow-xl backdrop:bg-black/70">
 <h2 id="recovery-title" className="text-2xl font-bold">Save your recovery phrase</h2>
 <p className="mt-3 text-sm text-white/75">These 12 words let you reset your seller password. Keep them in order in a safe, private place. Anyone with this phrase can take over your account. This is for your shop account, not a crypto wallet.</p>
 <PhraseGrid phrase={phrase}/>
 <button type="button" onClick={copy} className="w-full rounded-full bg-lime-300 p-3 font-semibold text-black">{copied?'Copied':'Copy recovery phrase'}</button>
 {!copied&&<details className="mt-3 text-sm"><summary>Copy manually</summary><textarea readOnly aria-label="Recovery phrase to copy" className="mt-2 w-full rounded bg-white/10 p-3" value={phrase} onCopy={()=>setCopied(true)}/></details>}
 <label className="my-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>I saved these words somewhere safe and understand they can reset my password.</label>
 {error&&<p role="alert" className="my-3 text-sm text-red-300">{error}</p>}
 <button type="button" disabled={busy||(required&&(!copied||!saved))} onClick={async()=>{setBusy(true);try{if(required)await apiRequest('/api/seller/recovery-phrase/acknowledge',{method:'POST',body:JSON.stringify({phrase})});onClose()}catch(e){setError(e.message)}finally{setBusy(false)}}} className="w-full rounded-full bg-white p-3 font-semibold text-black disabled:opacity-40">{busy?'Saving…':required?'I saved my phrase — continue':'Hide phrase'}</button>
 </dialog>
}
export function RecoveryOnboarding(){
 const {pathname}=useLocation(),[phrase,setPhrase]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{
  let active=true;setPhrase('');setError('')
  if(!pathname.startsWith('/seller')||['/seller/login','/seller/register'].includes(pathname))return
  apiRequest('/api/auth/me').then(async d=>{if(d.user.role!=='seller'&&!(d.user.role==='customer'&&['pending','needs_changes','rejected'].includes(d.user.sellerStatus)))return;const result=await apiRequest('/api/seller/recovery-phrase/setup',{method:'POST'});if(active)setPhrase(result.phrase||'')}).catch(e=>{if(active&&e.status!==401)setError(e.message)})
  return()=>{active=false}
 },[pathname,retry])
 return <>{phrase&&<PhraseDialog key={phrase} phrase={phrase} required onClose={()=>setPhrase('')}/>} {error&&<div role="alert" className="fixed bottom-20 left-4 right-4 z-[100] rounded-xl bg-black p-4 text-sm text-white">Recovery phrase setup: {error} <button className="underline" onClick={()=>setRetry(x=>x+1)}>Retry</button></div>}</>
}
export default function RecoveryPhraseSettings({adminUserId}){
 const [phrase,setPhrase]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{setPhrase('');setError('')},[adminUserId])
 return <section className="my-6 rounded-xl border bg-white p-5 text-black"><h2 className="font-semibold">Seller recovery phrase</h2><p className="my-3 text-sm text-gray-600">{adminUserId?'Verify the account holder before retrieving their encrypted backup. Access is recorded.':'Confirm your current password to view your 12-word recovery phrase. It changes after phrase-based password recovery.'}</p>
 <form onSubmit={async e=>{e.preventDefault();if(busy)return;const form=e.currentTarget,data=new FormData(form);setBusy(true);setError('');try{const result=await apiRequest(adminUserId?`/api/admin/users/${adminUserId}/recovery-phrase`:'/api/seller/recovery-phrase/reveal',{method:'POST',body:JSON.stringify({password:data.get('password'),identityReviewed:data.get('reviewed')==='on'})});form.reset();setPhrase(result.phrase)}catch(e){setError(e.message)}finally{setBusy(false)}}} className="space-y-3">
 {adminUserId&&<label className="flex gap-2 text-sm"><input type="checkbox" name="reviewed" required/>I verified the requester is the account holder.</label>}
 <label className="block text-sm">Your current password<input name="password" type="password" autoComplete="current-password" required className="mt-2 block w-full rounded border p-3"/></label>
 <button disabled={busy} className="rounded-lg bg-black px-4 py-3 text-sm text-white">{busy?'Checking…':'View recovery phrase'}</button></form>
 {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
 {phrase&&<PhraseDialog phrase={phrase} onClose={()=>setPhrase('')}/>}
 </section>
}
