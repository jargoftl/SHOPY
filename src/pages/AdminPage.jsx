import AdminSellerHistoricalSales from '../components/AdminSellerHistoricalSales.jsx'
import SiteName from '../components/SiteName.jsx'
import {RecoveryRequests} from '../components/AdminRecovery.jsx'
import AdminAccess from '../components/AdminAccess.jsx'
import ContentPlaceholder from '../components/ContentPlaceholder.jsx'
import AdminReferrals from '../components/AdminReferrals.jsx'
import AdminSellerFunding from '../components/AdminSellerFunding.jsx'
import AdminPaymentType,{paymentSection} from '../components/AdminPaymentType.jsx'
import SellerNotificationBell from '../components/SellerNotificationBell.jsx'
import {useEffect,useState} from 'react'
import {Link,useLocation,useNavigate,useSearchParams} from 'react-router-dom'
import {LayoutDashboard,Users,ClipboardCheck,ShoppingBag,Wallet,Warehouse,Megaphone,ChartNoAxesCombined,Settings,History,ArrowUpRight,ShieldCheck} from 'lucide-react'
import {apiRequest} from '../lib/api.js'
import {useSiteSettings} from '../context/siteSettings.js'
import AdminAccountDirectory from '../components/AdminAccountDirectory.jsx'
import AdminSellerApplications from '../components/AdminSellerApplications.jsx'
import AdminPurchases from '../components/AdminPurchases.jsx'
import AdminBuyers from '../components/AdminBuyers.jsx'
import AdminWarehouse from '../components/AdminWarehouse.jsx'
import AdminMarketing from '../components/AdminMarketing.jsx'
import AdminDisplayStats from '../components/AdminDisplayStats.jsx'
import RefundList from '../components/RefundList.jsx'
const tabs=[['overview','Overview',LayoutDashboard],['accounts','People & stores',Users],['applications','Seller approval',ClipboardCheck],['orders','Orders & tracking',ShoppingBag],['payment-type','Payment Type',Wallet],['seller-funding','Seller funding',Wallet],['seller-sales-history','Adding Seller Sales History',History],['buyer-wallet','Buyer funding',Wallet],['warehouse','Warehouse',Warehouse],['marketing','Marketing requests',Megaphone],['referrals','Referrals & rewards',Users],['statistics','Display statistics',ChartNoAxesCombined],['activity','Login activity',History],['settings','Site settings',Settings],['admin-access','Manage admins',ShieldCheck],['account-recovery','Account recovery',ShieldCheck]]
const toolLinks=[
 ['Edit store followers and visit stats','/admin/seller-metrics#store-records','increase followers follower count store visitor views traffic people visited last viewed opening date rating items sold'],
 ['Edit today’s orders','/admin/seller-metrics#today-orders','increase decrease order count number today daily seller'],
 ['Edit visitor statistics','/admin/seller-metrics#visitor-statistics','today total store visits people visited last 7 days last 30 days traffic'],
 ['Edit seller dashboard figures','/admin/seller-metrics#dashboard-values','daily today increase decrease visits visitors numbers people visited sales amounts orders profit rating total products weekly monthly'],
 ['Edit sales and visitor chart','/admin/seller-metrics#dashboard-values','chart graph traffic daily history historical visits sales'],
 ['Edit top-selling product counts','/admin/seller-metrics#dashboard-values','best sellers items units sold products rankings'],
 ['Fund a seller wallet','/admin#seller-funding','add credit manual seller balance money funds'],
 ['Fund a buyer account','/admin#buyer-wallet','add credit manual buyer customer balance money funds'],
 ['Review buyer deposits and withdrawals','/admin#buyer-wallet','buyer customer approval reject transaction receipt payout'],
 ['Manage people and stores','/admin#accounts','find search users customers buyer seller edit profile email store name suspend delete'],
 ['Approve a seller application','/admin#applications','accept reject pending registration verify documents identity'],
 ['Manage orders and shipment tracking','/admin#orders','orders logistics courier carrier tracking payment fulfillment dispatch'],
 ['Manage warehouse products','/admin#warehouse','items catalog inventory import upload add edit remove stock'],
 ['Edit historical seller sales','/admin#seller-sales-history','add old offline sale order item history revenue'],
 ['Handle login recovery','/admin#account-recovery','forgot reset password login restore access'],
 ['Change site settings','/admin#settings','site name branding appearance settings'],
 ['View login IPs and locations','/admin#activity','audit log login history activity sign in country city'],
 ['Review marketing requests','/admin#marketing','promotion ads boost store upgrade level'],
 ['Manage referral rewards','/admin#referrals','referral invite reward commission'],
 ['Seller credit score','/admin#seller-funding','increase credit score 100 seller points'],
 ['Review seller deposits','/admin#payment-type-deposits','approve deposit receipt proof payment'],
 ['Review seller withdrawals','/admin#payment-type-withdrawals','approve reject withdrawal crypto transfer'],
 ['Configure receiving wallets','/admin#payment-type','coin network address qr payment'],
 ['Review refunds','/admin#refunds','refund order request'],
]

function AdminToolSearch({isSuperAdmin}){
 const [query,setQuery]=useState('')
 const terms=query.toLowerCase().trim().split(/[^a-z0-9]+/).filter(term=>term&&!['a','on','the','to','of','i','can','how','that','for','in','an','my','want'].includes(term))
 const tools=[...toolLinks,...tabs.filter(([id])=>id!=='admin-access'||isSuperAdmin).map(([id,label])=>[label,id==='admin-access'?'/super-admin':`/admin#${id}`,''])]
 const matches=terms.length?tools.map(([label,path,keywords])=>({
  label,path,rank:terms.reduce((score,term)=>score+(label.toLowerCase().includes(term)?2:keywords.includes(term)?1:0),0)
 })).filter(tool=>tool.rank>0).sort((a,b)=>b.rank-a.rank).slice(0,8):[]
 return <div className="mt-4 max-w-xl rounded-xl border border-slate-200 bg-white p-3">
  <label className="block text-sm font-semibold">Search admin tools
   <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search orders, funding, settings, or seller stats" className="mt-2 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"/>
  </label>
  {terms.length>0&&(matches.length?<ul className="mt-2 divide-y divide-slate-100">
   {matches.map(({label,path})=><li key={label}><Link onClick={()=>setQuery('')} to={path} className="flex justify-between gap-2 rounded px-2 py-2 text-sm text-blue-800 hover:bg-blue-50">{label}<ArrowUpRight size={15} aria-hidden="true"/></Link></li>)}
  </ul>:<p className="mt-2 text-sm text-slate-600">No matching tools.</p>)}
 </div>
}

function activeTab(hash,order){if(order)return 'orders';if(paymentSection(hash))return 'payment-type';const key=hash.replace('#','');return ({'purchase-orders':'orders','refunds':'orders','marketing-requests':'marketing','seller-applications':'applications'})[key]||tabs.find(t=>t[0]===key)?.[0]||'overview'}
export default function AdminPage(){
 const location=useLocation(),navigate=useNavigate(),[params]=useSearchParams(),tab=activeTab(location.hash,params.get('order'))
 const {siteName,saveSiteName}=useSiteSettings(),[admin,setAdmin]=useState(null),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[buyerRequestsOpen,setBuyerRequestsOpen]=useState(false)
 useEffect(()=>{let active=true;apiRequest('/api/admin/overview').then(d=>{if(active){setAdmin(d.user);setData({counts:d.counts,users:[],sellers:[],products:[],events:[],usersLoaded:false,eventsLoaded:false})}}).catch(e=>active&&setError(e.message));return()=>{active=false}},[])
 useEffect(()=>{if(!admin||!data)return;let active=true
 if(['accounts','statistics'].includes(tab)&&!data.usersLoaded)Promise.all([apiRequest('/api/admin/users'),apiRequest('/api/admin/sellers')]).then(([u,s])=>{if(active)setData(d=>({...d,users:u.users,sellers:s.sellers,usersLoaded:true}))}).catch(e=>active&&setError(e.message))
 return()=>{active=false}
 },[tab,admin?.id,data?.usersLoaded])

 useEffect(()=>{
  if(tab!=='activity'||!admin?.id)return
  let active=true
  let pending=false
  async function refresh(){
   if(document.hidden||pending)return
   pending=true
   try{
    const {events}=await apiRequest('/api/admin/events',{cache:'no-store',background:true})
    if(active)setData(previous=>({...previous,events,eventsLoaded:true}))
   }catch(error){if(active)setError(error.message)}
   finally{pending=false}
  }
  refresh()
  const timer=window.setInterval(refresh,15000)
  window.addEventListener('focus',refresh)
  document.addEventListener('visibilitychange',refresh)
  return()=>{
   active=false
   window.clearInterval(timer)
   window.removeEventListener('focus',refresh)
   document.removeEventListener('visibilitychange',refresh)
  }
 },[tab,admin?.id])

 return <div className="admin-workspace min-h-screen bg-[#f7f7f7] text-black"><header className="flex flex-wrap items-center justify-between gap-4 border-b bg-white px-5 py-5 lg:px-8"><Link to="/admin" className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xl font-black"><SiteName logo/><span className="text-xs font-normal tracking-widest text-gray-500">ADMIN CENTRE</span></Link><div className="flex flex-wrap items-center gap-5 text-xs"><SellerNotificationBell/><span>{admin?.fullName} {admin&&`· #${admin.publicId}`}</span><Link to="/" className="flex items-center gap-1 underline">View website<ArrowUpRight size={13}/></Link><button onClick={async()=>{await apiRequest('/api/auth/logout',{method:'POST'});navigate('/login')}} className="underline">Log out of this tab</button></div></header><div className="mx-auto grid max-w-[1700px] lg:grid-cols-[230px_1fr]"><aside className="min-w-0 border-b bg-white p-4 lg:min-h-screen lg:border-r"><p className="mb-4 px-3 pt-2 text-[10px] font-semibold tracking-[.2em] text-gray-400">MANAGE YOUR MARKETPLACE</p><nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Admin navigation">{tabs.filter(([id])=>id!=='admin-access'||admin?.isSuperAdmin).map(([id,label,Icon])=><Link key={id} to={id==='admin-access'?'/super-admin':`/admin#${id}`} className={`flex shrink-0 items-center gap-3 px-3 py-3 text-sm ${tab===id?'bg-black font-semibold text-white':'text-gray-500 hover:bg-gray-100'}`}><Icon size={17}/>{label}</Link>)}</nav></aside><main className="min-w-0 p-5 pb-24 lg:p-8"><p className="text-xs uppercase tracking-[.18em] text-gray-400">ADMIN WORKSPACE</p><h1 className="mt-2 text-3xl font-semibold">{tabs.find(t=>t[0]===tab)?.[1]}</h1>{admin&&<AdminToolSearch isSuperAdmin={admin.isSuperAdmin}/>}{error&&<p role="alert" className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}<Link className="ml-2 underline" to="/login?switch=1">Admin login</Link></p>}{notice&&<p role="status" className="mt-5 border bg-white p-4 text-sm">{notice}</p>}{!data&&!error&&<ContentPlaceholder/>}{admin&&data&&<div className="mt-7">
 {tab==='overview'&&<><Link to="/admin/seller-metrics" className="mb-4 inline-flex rounded-lg border bg-white px-4 py-2 text-sm font-semibold">Manage seller credit scores</Link><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Registered accounts',data.counts.accounts],['Store profiles',data.counts.stores],['Products',data.counts.products],['Seller applications pending',data.counts.pending]].map(([label,value])=><div key={label} className="border bg-white p-5"><p className="text-xs text-gray-500">{label}</p><p className="mt-4 text-3xl font-semibold">{value.toLocaleString()}</p></div>)}</div><h2 className="mt-8 text-lg font-semibold">What would you like to do?</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[['applications','Approve a seller','Review identity documents and approve or reject the application.'],['orders','Process an order','Review paid orders and send tracking numbers to sellers.'],['buyer-wallet','Fund a buyer','Credit a buyer balance or review coin deposit requests.'],['payment-type-deposits','Review seller deposits','Open payment proof and confirm funds received.'],['payment-type-withdrawals','Review seller withdrawals','Check the receiving wallet and record a confirmed transfer.'],['accounts','Find an account','Search buyer and seller profiles and open their controls.'],['statistics','Adjust display statistics','Apply labeled display adjustments with a saved audit reason.']].map(([id,label,description])=><Link key={id} to={id==='admin-access'?'/super-admin':`/admin#${id}`} className="border bg-white p-5 hover:border-black"><div className="flex justify-between"><h3 className="font-semibold">{label}</h3><ArrowUpRight size={17}/></div><p className="mt-3 text-sm leading-6 text-gray-500">{description}</p></Link>)}</div></>}
 {tab==='admin-access'&&(admin.isSuperAdmin?<AdminAccess/>:<p role="alert" className="border bg-white p-5 text-sm">Only the super admin can manage administrator access.</p>)}
 {tab==='account-recovery'&&<RecoveryRequests/>}
 {tab==='accounts'&&<AdminAccountDirectory users={data.users} sellers={data.sellers}/>}
 {tab==='seller-funding'&&<AdminSellerFunding/>}
 {tab==='applications'&&<AdminSellerApplications/>}
 {tab==='orders'&&<><AdminPurchases selectedNumber={params.get('order')} autoOpen/><details className="mt-6 border bg-white p-5"><summary className="cursor-pointer font-semibold">Refund reviews</summary><div className="mt-4"><RefundList admin/></div></details></>}
 {tab==='seller-sales-history'&&<AdminSellerHistoricalSales/>}
 {tab==='payment-type'&&<AdminPaymentType section={paymentSection(location.hash)}/>}
 {tab==='buyer-wallet'&&<><AdminSellerFunding kind="buyer"/><button type="button" onClick={()=>setBuyerRequestsOpen(v=>!v)} className="my-6 min-h-11 rounded-lg border bg-white px-4 py-3 text-sm font-semibold">{buyerRequestsOpen?'Hide coin requests':'Review coin deposit / withdrawal requests'}</button>{buyerRequestsOpen&&<AdminBuyers/>}</>}
 {tab==='warehouse'&&<AdminWarehouse/>}
 {tab==='referrals'&&<AdminReferrals/>}
 {tab==='marketing'&&<AdminMarketing/>}
 {tab==='statistics'&&<AdminDisplayStats sellers={data.sellers.filter(s=>data.users.some(u=>u.id===s.id&&u.role==='seller'))}/>}
 {tab==='activity'&&<section className="border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Recent account sign-ins and registrations</h2><button className="text-xs underline" onClick={async()=>{try{const result=await apiRequest('/api/admin/events');setData(d=>({...d,events:result.events}))}catch(e){setError(e.message)}}}>Refresh activity</button></div>{data.eventsLoaded&&!data.events.length&&<p className="mt-4 text-sm">No sign-ins or registrations recorded yet.</p>}{data.events.map(e=><div key={e.id} className="mt-4 flex flex-wrap justify-between gap-3 border-b pb-4 text-sm"><Link to={`/admin/users/${e.userId}`} className="underline">{e.fullName} · #{e.publicId}</Link><span>{e.type==='login'?'Signed in':'Registered'}</span><div className="min-w-0 break-words text-xs"><p><strong>IP address</strong> {e.ipAddress||'Not recorded'}</p><p className="mt-1"><strong>Approximate location</strong> {e.location||'Unavailable'}</p></div><time className="text-xs text-gray-500">{e.createdAt} UTC</time></div>)}</section>}
 {tab==='settings'&&<form className="max-w-xl border bg-white p-5" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await saveSiteName(new FormData(e.currentTarget).get('siteName'));setNotice('Site name saved.')}catch(e){setError(e.message)}finally{setBusy(false)}}}><h2 className="font-semibold">Website name</h2><label className="mt-4 block text-sm">Site name<input name="siteName" defaultValue={siteName} required maxLength={60} className="mt-2 block w-full border p-3"/></label><button disabled={busy} className="mt-4 bg-black px-5 py-3 text-sm font-semibold text-white">Save changes</button></form>}
 </div>}</main></div></div>
}
