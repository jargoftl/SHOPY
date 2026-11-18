import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {ShieldCheck} from 'lucide-react'
import SiteName from '../components/SiteName.jsx'
import AdminAccess from '../components/AdminAccess.jsx'
import ContentPlaceholder from '../components/ContentPlaceholder.jsx'
import {apiRequest} from '../lib/api.js'
export default function SuperAdminPage(){
 const [user,setUser]=useState(null),[error,setError]=useState('')
 useEffect(()=>{let active=true;apiRequest('/api/auth/me',{cache:'no-store'}).then(({user})=>{if(!active)return;if(user.role!=='admin'||!user.isSuperAdmin)setError('Only the super admin can open this page.');else setUser(user)}).catch(e=>active&&setError(e.message));return()=>{active=false}},[])
 return <div className="min-h-screen bg-[#f7f7f7] text-black"><header className="border-b bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5"><Link to="/" className="text-xl font-bold"><SiteName logo/></Link><Link to="/admin" className="text-sm underline">Admin dashboard</Link></div></header><main className="mx-auto max-w-5xl px-5 py-10"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gray-500"><ShieldCheck size={16}/>Owner workspace</p><h1 className="mt-3 text-3xl font-semibold">Super admin</h1>{error?<p role="alert" className="mt-6 rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700">{error}<Link to="/login?switch=1" className="ml-3 underline">Sign in</Link></p>:user?<div className="mt-7"><AdminAccess/></div>:<ContentPlaceholder/>}</main></div>
}
