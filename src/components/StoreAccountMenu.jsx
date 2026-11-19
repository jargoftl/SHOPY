import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {UserRound} from 'lucide-react'
import {apiRequest} from '../lib/api.js'
export default function StoreAccountMenu(){
 const [user,setUser]=useState(null),[open,setOpen]=useState(false)
 useEffect(()=>{let active=true;const load=()=>apiRequest('/api/auth/me').then(d=>active&&setUser(d.user)).catch(()=>active&&setUser(null));load();window.addEventListener('account-session-changed',load);return()=>{active=false;window.removeEventListener('account-session-changed',load)}},[])
 if(!user)return <div className="flex items-center gap-2"><Link to="/login" aria-label="Log in or create an account" className="grid size-10 place-items-center"><UserRound size={20}/></Link></div>
 const dashboard=user.isSuperAdmin?'/super-admin':user.role==='admin'?'/admin':user.role==='seller'?'/seller':'/profile'
 return <div className="relative"><button onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-label={`Account: ${user.fullName}`} className="flex max-w-40 items-center gap-2 text-xs"><UserRound size={20}/><span className="hidden max-w-32 truncate xl:block">{user.fullName}</span></button>{open&&<div className="absolute right-0 top-9 z-50 w-60 border border-gray-200 bg-white p-4 text-sm text-black shadow-xl"><p className="font-semibold">{user.fullName}</p><p className="mt-1 text-xs capitalize text-gray-500">{user.role==='admin'?'ADMIN · ':''}#{user.publicId}</p><Link className="mt-4 block py-2 underline" to={dashboard}>My {user.isSuperAdmin?'super-admin page':user.role==='seller'?'workspace':user.role==='admin'?'admin dashboard':'account'}</Link>{user.role!=='admin'&&<Link className="block py-2 underline" to="/orders">My purchases</Link>}<a className="block py-2 underline" href="/login?switch=1" target="_blank" rel="noopener noreferrer">Sign in another account in a new tab</a><button className="mt-2 text-xs underline" onClick={async()=>{await apiRequest('/api/auth/logout',{method:'POST'});setUser(null);setOpen(false)}}>Log out of this tab</button></div>}</div>
}
