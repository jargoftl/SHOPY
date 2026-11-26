import {useEffect,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {ShieldCheck,UserPlus,X} from 'lucide-react'
import {apiRequest} from '../lib/api.js'
import PasswordInput from './PasswordInput.jsx'
export default function AdminAccess(){
 const [data,setData]=useState(null),[search,setSearch]=useState(''),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const navigate=useNavigate()
 const dialog=useRef(null)
 const load=async(query='')=>{const result=await apiRequest('/api/admin/access'+(query?'?search='+encodeURIComponent(query):''));setData(result)}
 useEffect(()=>{let active=true;apiRequest('/api/admin/access').then(d=>active&&setData(d)).catch(e=>active&&setError(e.message));return()=>{active=false}},[])
 useEffect(()=>{if(selected)dialog.current?.showModal()},[selected])
 const labels={grant:'Make admin',remove:'Remove admin access',grant_management:'Grant management access',delete:'Delete account'}
 function select(account,action){setError('');setNotice('');setSelected({...account,action})}
 const submit=async event=>{
  event.preventDefault()
  if(busy)return
  const form=new FormData(event.currentTarget)
  const password=form.get('password')
  setBusy(true);setError('')
  try{
   const result=selected.action==='delete'
    ?await apiRequest(`/api/admin/users/${selected.id}`,{method:'DELETE',body:JSON.stringify({password,confirmEmail:form.get('confirmEmail')})})
    :await apiRequest(`/api/admin/access/${selected.id}`,{method:'PATCH',body:JSON.stringify({action:selected.action,expectedRole:selected.role,password})})
   setSelected(null)
   if(result.signedOut){navigate('/login?switch=1',{replace:true});return}
   setNotice(selected.action==='delete'?'Administrator account deleted.':'Administrator access updated. The account must sign in again.')
   await load(search)
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section className="space-y-6"><div className="rounded-xl border bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck size={19}/>Super-admin controls</h2><p className="mt-2 text-sm text-gray-600">Add or remove administrator access for existing accounts. Administrators have full access to funding, orders and identity reviews. Keep at least one active admin with management access. To replace the last super admin, grant another admin management access first.</p><form onSubmit={async e=>{e.preventDefault();setError('');try{await load(search)}catch(e){setError(e.message)}}} className="mt-5 flex flex-wrap gap-3"><input aria-label="Find user by email or account ID" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Exact email or account ID" maxLength={254} className="min-w-0 flex-1 rounded-lg border px-3 py-3 text-sm"/><button className="rounded-lg bg-black px-5 py-3 text-sm text-white">Find account</button></form></div>
 {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
 <div className="space-y-3">{data?.accounts.map(account=><article key={account.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5"><div className="min-w-0"><h3 className="font-semibold">{account.fullName}</h3><p className="break-all text-sm text-gray-600">{account.email}</p><p className="mt-1 text-xs text-gray-500">#{account.publicId} · {account.isSuperAdmin?'Super admin':account.role}{Boolean(account.suspended)&&' · Suspended'}</p></div><div className="flex flex-wrap gap-2">
 {account.role!=='admin'&&!account.suspended&&<button onClick={()=>select(account,'grant')} className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"><UserPlus size={16}/>{labels.grant}</button>}
 {account.role==='admin'&&<>
  {!account.isSuperAdmin&&!account.suspended&&<button onClick={()=>select(account,'grant_management')} className="rounded-lg border px-4 py-3 text-sm">{labels.grant_management}</button>}
  {!account.suspended&&<button onClick={()=>select(account,'remove')} className="rounded-lg border px-4 py-3 text-sm">{labels.remove}</button>}
  <button onClick={()=>select(account,'delete')} className="rounded-lg border border-red-200 px-4 py-3 text-sm text-red-700">{labels.delete}</button>
 </>}
 </div></article>)}</div>
 <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Admin access history</h2>{data?.history.length===0&&<p className="mt-3 text-sm text-gray-500">No administrator access changes recorded.</p>}{data?.history.map(item=><div key={item.id} className="mt-4 border-t pt-3 text-sm"><p className="break-all">{item.targetEmail} · {({admin_granted:'Admin access added',admin_removed:'Admin access removed',super_admin_granted:'Management access granted'})[item.action]}</p><p className="mt-1 break-all text-xs text-gray-500">By {item.adminEmail} · {item.createdAt} UTC</p></div>)}</section>
 {selected&&<dialog ref={dialog} onCancel={e=>{if(busy)e.preventDefault();else setSelected(null)}} onClose={()=>{if(!busy)setSelected(null)}} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border-0 p-6 shadow-xl backdrop:bg-black/45"><div className="flex items-start justify-between gap-3"><h2 className="text-xl font-semibold">{labels[selected.action]+'?'}</h2><button type="button" disabled={busy} aria-label="Close confirmation" onClick={()=>setSelected(null)}><X size={20}/></button></div><p className="mt-3 break-all text-sm text-gray-600">{selected.fullName} · {selected.email}</p><form onSubmit={submit} className="mt-5 space-y-4">{selected.action==='delete'&&<><p className="text-sm text-gray-600">This closes the account and signs it out of all sessions.</p><label className="block text-sm">Type the account email to confirm<input name="confirmEmail" type="email" required className="mt-2 w-full rounded-lg border px-3 py-3"/></label></>}<label className="block text-sm">Confirm your login password<PasswordInput name="password" required autoComplete="current-password" className="mt-2 w-full rounded-lg border px-3 py-3"/></label>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-lg bg-black px-4 py-3 text-sm text-white disabled:opacity-50">{busy?'Saving…':'Confirm change'}</button></form></dialog>}
 </section>
}
