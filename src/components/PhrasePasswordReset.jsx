import {useState} from 'react'
import {Link} from 'react-router-dom'
import {apiRequest} from '../lib/api.js'
export default function PhrasePasswordReset(){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false)
 if(done)return <p role="status" className="mb-6">Password reset. Your previous phrase is now invalid. <Link className="underline" to="/seller/login">Sign in</Link> and save your new phrase.</p>
 return <section className="mb-6 rounded-xl border p-4"><button type="button" className="font-semibold underline" onClick={()=>setOpen(!open)}>Reset seller password with 12-word phrase</button>{open&&<form className="mt-4 space-y-4" onSubmit={async e=>{e.preventDefault();if(busy)return;const form=e.currentTarget,data=new FormData(form);setError('');if(data.get('password')!==data.get('confirm')){setError('Passwords must match.');return}setBusy(true);try{await apiRequest('/api/auth/reset-with-phrase',{method:'POST',body:JSON.stringify({email:data.get('email'),phrase:data.get('phrase'),password:data.get('password')})});form.reset();setDone(true)}catch(e){setError(e.message)}finally{setBusy(false)}}}>
 <label className="block text-sm">Seller email<input name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded border p-3"/></label>
 <label className="block text-sm">12 recovery words, in order<textarea name="phrase" required maxLength={300} rows={3} autoComplete="off" autoCapitalize="none" spellCheck={false} className="mt-2 w-full rounded border p-3"/></label>
 <label className="block text-sm">New password<input name="password" type="password" minLength={8} required autoComplete="new-password" className="mt-2 w-full rounded border p-3"/></label>
 <label className="block text-sm">Confirm new password<input name="confirm" type="password" minLength={8} required autoComplete="new-password" className="mt-2 w-full rounded border p-3"/></label>
 {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
 <button disabled={busy} className="w-full rounded bg-black p-3 text-white">{busy?'Resetting…':'Reset password'}</button>
 <p className="text-xs text-gray-600">Lost your phrase? Use support-assisted recovery below. Never enter a crypto wallet seed here.</p></form>}</section>
}
