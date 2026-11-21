import { formatOrderReference } from '../lib/orderReference.js'
import {useSellerLanguage} from '../context/SellerLanguageContext.jsx'
import {useEffect,useMemo,useState} from 'react'
import {Link} from 'react-router-dom'
import {CalendarDays,Store,Settings,RotateCcw,Gift,ArrowDownLeft,ArrowUpRight,Package,Crown,BadgeCheck} from 'lucide-react'
import SellerWorkspace,{money} from '../components/SellerWorkspace.jsx'
import SaleConfirmations from '../components/SaleConfirmations.jsx'
import {formatTimestamp} from '../lib/storeDates.js'
import StoreDates from '../components/StoreDates.jsx'
import OrderStatusBadge from '../components/OrderStatusBadge.jsx'
import {paymentStatusLabel} from '../lib/fulfillment.js'
import {apiRequest} from '../lib/api.js'
const shortcuts=[[Settings,'Store settings','/seller/account#settings','#ff635b'],[RotateCcw,'Refunds','/seller/refunds','#536aff'],[Package,'Warehouse','/seller/warehouse','#42a8ef'],[Crown,'Store upgrade','/seller/marketing/upgrade','#42a8ef'],[BadgeCheck,'Store level','/seller/marketing/levels','#e9ab2d'],[Gift,'Referrals','/seller/referrals','#35bba0'],[ArrowDownLeft,'Deposit','/seller/wallet?action=deposit','#35bd80'],[ArrowUpRight,'Withdraw','/seller/wallet?action=withdrawal','#5471ff']]
export default function SellerDashboardPage(){
 const {t}=useSellerLanguage()
 const [user,setUser]=useState(null),[data,setData]=useState(null),[products,setProducts]=useState([]),[error,setError]=useState(''),[days,setDays]=useState(7),[limit,setLimit]=useState(12)
 useEffect(()=>{let active=true;const refresh=()=>Promise.all([apiRequest('/api/auth/me'),apiRequest('/api/seller/analytics')]).then(([u,d])=>{if(active){setUser(u.user);setData(d);setError('')}}).catch(e=>active&&setError(e.message));refresh();apiRequest('/api/seller/products').then(d=>active&&setProducts(d.products)).catch(e=>active&&setError(e.message));const tick=()=>{if(!document.hidden)refresh()};const timer=setInterval(tick,30000);return()=>{active=false;clearInterval(timer)}},[])
 const series=useMemo(()=>{const end=new Date((data?.today||new Date().toISOString().slice(0,10))+'T00:00:00Z');return Array.from({length:days},(_,i)=>{const date=new Date(end);date.setUTCDate(date.getUTCDate()-days+1+i);const day=date.toISOString().slice(0,10);return {day,sales:data?.daily.find(d=>d.day===day)?.salesCents||0,visits:data?.visits.find(d=>d.day===day)?.visits||0}})},[data,days])
 const maxSales=Math.max(100,...series.map(d=>d.sales)),maxVisits=Math.max(1,...series.map(d=>d.visits))
 const points=key=>series.map((d,i)=>`${35+i*315/Math.max(1,days-1)},${210-d[key]/(key==='sales'?maxSales:maxVisits)*165}`).join(' ')
 const today=data?.today,visits=(length)=>{const end=new Date((today||'2000-01-01')+'T00:00:00Z');end.setUTCDate(end.getUTCDate()-length+1);const from=end.toISOString().slice(0,10);return (data?.visits||[]).filter(v=>v.day>=from&&v.day<=today).reduce((s,v)=>s+v.visits,0)}
 const todayData=data?.daily.find(d=>d.day===today)
 const metrics=data?.dashboardMetrics??{}
 const number=value=>value==null?'—':Number(value).toLocaleString()
 const dollars=value=>value==null?'—':money(Math.round(value*100))
 const totals=[
  ['Total Products',number(metrics.totalProducts??data?.overview.products),'bg-rose-50 text-rose-900'],
  ['Total Sales Amount',dollars(metrics.totalSalesAmount??(data&&(data.overview.salesCents+(data.historicalSales?.salesCents||0))/100)),'bg-sky-50 text-sky-900'],
  ['Total Orders',number(metrics.totalOrders??data?.overview.paidOrders),'bg-indigo-50 text-indigo-900'],
  ['Total Profit',dollars(metrics.totalProfit),'bg-teal-50 text-teal-900'],
 ]
 const groups=[
  ['Shop Overview',[
   ['Overall Rating',number(metrics.overallRating??(data?.overallRating==null?null:Number(data.overallRating).toFixed(2)))],
   ['Seller Credit Score',number(metrics.sellerCreditScore)],
   ['Store Followers',number(data?.overview.followers)],
  ]],
  ['Visitor Statistics',[
   ['Today’s Visitors',number(metrics.todayVisitors??(data?visits(1):null))],
   ['Last 7 days',number(metrics.visitorsLast7Days??(data?visits(7):null))],
   ['Last 30 days',number(metrics.visitorsLast30Days??(data?visits(30):null))],
  ]],
  ['Today’s Statistics',[
   ['Today’s Orders',number(metrics.todayOrders??(data?todayData?.orders??0:null))],
   ['Today’s Sales',dollars(metrics.todaySales??(data?(todayData?.salesCents??0)/100:null))],
   ['Estimated Profit',dollars(metrics.estimatedProfit)],
  ]],
 ]
 return <SellerWorkspace user={user}><h1 className="portal-title">{t("Store overview")}</h1>{error&&<p role="alert" className="portal-error">{error}</p>}
 {data?.dates&&<section className="portal-card" aria-label={t("Account and store dates")}>
  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
   <div className="flex items-center gap-3">
    <CalendarDays className="shrink-0 text-blue-700" size={20} aria-hidden="true"/>
    <div><dt className="text-xs text-slate-600">{t("Account created")}</dt><dd className="text-sm font-semibold">{formatTimestamp(data.dates.accountCreatedAt)}</dd></div>
   </div>
   <div className="flex items-center gap-3">
    <Store className="shrink-0 text-blue-700" size={20} aria-hidden="true"/>
    <div><dt className="text-xs text-slate-600">{t("Store created")}</dt><dd className="text-sm font-semibold">{formatTimestamp(data.dates.storeCreatedAt)}</dd></div>
   </div>
   {data.dates.approvedAt&&<div className="flex items-center gap-3">
    <BadgeCheck className="shrink-0 text-blue-700" size={20} aria-hidden="true"/>
    <div><dt className="text-xs text-slate-600">{t("Seller approved")}</dt><dd className="text-sm font-semibold">{formatTimestamp(data.dates.approvedAt)}</dd></div>
   </div>}
  </dl>
 </section>}
 <section className="portal-card" aria-label={t('Dashboard totals')}>
  <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
   {totals.map(([label,value,color])=><div key={label} className={`min-w-0 rounded-xl p-3 sm:p-5 ${color}`}>
    <dt className="text-xs font-medium sm:text-sm">{t(label)}</dt>
    <dd className="mt-2 break-words text-lg font-semibold tabular-nums sm:text-2xl">{value}</dd>
   </div>)}
  </dl>
 </section>
 <div className="grid gap-4 xl:grid-cols-3">
  {groups.map(([heading,figures])=><section key={heading} className="portal-card min-w-0">
   <h2>{t(heading)}</h2>
   <dl className="mt-4 grid grid-cols-3 gap-2">
    {figures.map(([label,value])=><div key={label} className="min-w-0">
     <dt className="text-xs text-slate-600">{t(label)}</dt>
     <dd className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-900 sm:text-base">{value}</dd>
    </div>)}
   </dl>
  </section>)}
 </div>
 <section className="portal-card portal-chart"><div className="portal-chart-head"><h2>{t("Sales & visits")}</h2><div className="portal-period" aria-label="Chart period">{[[1,'Today'],[7,'Last 7 days'],[30,'Last 30 days']].map(([n,label])=><button key={n} aria-pressed={days===n} onClick={()=>setDays(n)}>{t(label)}</button>)}</div></div><div className="portal-chart-legend"><span><i/>{t("Sales (USD)")}</span><span><i/>{t("Visits (right)")}</span></div><svg viewBox="0 0 400 252" role="img" aria-label={`Recorded sales and visits for the last ${days} days`}>{[0,1,2,3,4].map(i=><g key={i}><line x1="35" x2="350" y1={45+i*41.25} y2={45+i*41.25} stroke="#dbe2eb" strokeDasharray="5 5"/><text x="0" y={49+i*41.25} fontSize="13" fill="#687386">{(maxSales*(4-i)/4/100).toFixed(0)}</text><text x="362" y={49+i*41.25} fontSize="13" fill="#687386">{Math.round(maxVisits*(4-i)/4)}</text></g>)}<polyline points={points('visits')} fill="none" stroke="#969da8" strokeWidth="3"/><polyline points={points('sales')} fill="none" stroke="#2155ef" strokeWidth="3"/>{series.map((d,i)=><g key={d.day}><circle cx={35+i*315/Math.max(1,days-1)} cy={210-d.sales/maxSales*165} r="3.5" fill="white" stroke="#2155ef" strokeWidth="2"/><circle cx={35+i*315/Math.max(1,days-1)} cy={210-d.visits/maxVisits*165} r="3" fill="white" stroke="#969da8" strokeWidth="2"/></g>)}<text x="35" y="240" fontSize="13" fill="#687386">{series[0]?.day}</text><text x="270" y="240" fontSize="13" fill="#687386">{series.at(-1)?.day}</text></svg><p className="portal-note">{t("Recorded activity · UTC · sales shown before refunds")}</p></section>
 <section className="portal-card portal-shortcuts" aria-label="Store tools">{shortcuts.map(([Icon,label,to,color])=><Link key={to} to={to}><i style={{background:color}}><Icon size={23}/></i><span>{t(label)}</span></Link>)}</section>
 <SaleConfirmations sales={data?.orders||[]} onConfirmed={async()=>setData(await apiRequest('/api/seller/analytics'))}/><section className="portal-card"><div className="portal-section-head"><h2>{t("Recent orders")}</h2><Link to="/seller/orders">{t("View all")}</Link></div>{data?.orders.slice(0,4).map(o=><Link className="portal-order-row" key={o.orderId} to={`/seller/orders?order=${o.orderNumber}`}><div><strong>{formatOrderReference(o)}</strong><OrderStatusBadge status={o.paymentStatus} label={t(paymentStatusLabel(o.paymentStatus))}/></div><strong>{money(o.amountCents)}</strong></Link>)}{data&&!data.orders.length&&<p className="portal-empty">{t("No orders yet.")}</p>}</section>
 <section className="portal-card"><h2>{t("Top 10 best-selling items")}</h2><div className="portal-product-list">{data?.products.filter(p=>p.units>0).map((p,i)=><Link to={products.some(item=>item.id===p.id&&item.isPublished)?`/products/${p.id}`:'/seller/products'} key={p.id||i} className="portal-product-row">{p.imageUrl?<img src={p.imageUrl} alt="" loading="lazy"/>:<span className="portal-image-placeholder"><Package/></span>}<div><h3>{p.name}</h3><p>{p.units} {t('sold')}</p><strong>{money(p.salesCents)} <small>{t("sales")}</small></strong></div></Link>)}</div>{data&&!data.products.some(p=>p.units>0)&&<p className="portal-empty">{t("Your best-selling items will appear after completed payments.")}</p>}</section>
 <section className="portal-card"><div className="portal-section-head"><h2>{t('Store products')}</h2><Link to="/seller/products">{t("Manage")}</Link></div><div className="portal-product-list">{products.slice(0,limit).map(p=><Link to={p.isPublished?`/products/${p.id}`:'/seller/products'} className="portal-product-row" key={p.id}><img src={p.imageUrl} alt="" loading="lazy"/><div><h3>{p.name}</h3><p>{p.category}</p><strong>{money(Math.round(p.price*100))}</strong></div></Link>)}</div>{products.length>limit&&<button className="portal-load-more" onClick={()=>setLimit(n=>n+24)}>{t("Show more products")}</button>}{!products.length&&<Link className="portal-empty" to="/seller/warehouse">{t("Browse the warehouse to add products.")}</Link>}</section>{data?.dates?.establishedOn&&<div className="portal-dates"><StoreDates {...data.dates}/></div>}</SellerWorkspace>
}
