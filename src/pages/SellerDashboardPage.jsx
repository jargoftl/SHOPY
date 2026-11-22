import { formatOrderReference } from '../lib/orderReference.js'
import {useSellerLanguage} from '../context/SellerLanguageContext.jsx'
import {useEffect,useMemo,useState} from 'react'
import {Link} from 'react-router-dom'
import {Settings,RotateCcw,Gift,ArrowDownLeft,ArrowUpRight,Package,Crown,BadgeCheck} from 'lucide-react'
import SellerWorkspace,{money} from '../components/SellerWorkspace.jsx'
import SaleConfirmations from '../components/SaleConfirmations.jsx'
import StoreDates from '../components/StoreDates.jsx'
import OrderStatusBadge from '../components/OrderStatusBadge.jsx'
import {paymentStatusLabel} from '../lib/fulfillment.js'
import {apiRequest} from '../lib/api.js'
const shortcuts=[[Settings,'Store settings','/seller/account/settings','#ff635b'],[RotateCcw,'Refunds','/seller/refunds','#536aff'],[Package,'Warehouse','/seller/warehouse','#42a8ef'],[Crown,'Store upgrade','/seller/marketing/upgrade','#42a8ef'],[BadgeCheck,'Store level','/seller/marketing/levels','#e9ab2d'],[Gift,'Referrals','/seller/referrals','#35bba0'],[ArrowDownLeft,'Deposit','/seller/wallet?action=deposit','#35bd80'],[ArrowUpRight,'Withdraw','/seller/wallet?action=withdrawal','#5471ff']]
export default function SellerDashboardPage(){
 const {t}=useSellerLanguage()
 const [user,setUser]=useState(null),[data,setData]=useState(null),[products,setProducts]=useState([]),[error,setError]=useState(''),[creditScore,setCreditScore]=useState(null),[days,setDays]=useState(7),[heatDay,setHeatDay]=useState(''),[limit,setLimit]=useState(12)
 useEffect(()=>{let active=true;const refresh=()=>Promise.all([apiRequest('/api/auth/me'),apiRequest('/api/seller/analytics')]).then(([u,d])=>{if(active){setUser(u.user);setData(d);setError('')}}).catch(e=>active&&setError(e.message));apiRequest('/api/seller/products').then(d=>active&&setProducts(d.products)).catch(e=>active&&setError(e.message));const tick=()=>{if(document.hidden)return;refresh();apiRequest('/api/seller/dashboard-metrics',{cache:'no-store'}).then(({metrics})=>{if(active)setCreditScore(metrics.sellerCreditScore??5)}).catch(()=>{})};tick();const timer=setInterval(tick,30000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick)}},[])
 const series=useMemo(()=>{
  const config=data?.dashboardMetrics
  const chinaDay=data?.chinaDay
  const daily=config?.dailyDay&&config.dailyDay===chinaDay?config:{}
  if(days===1&&data?.chinaToday){
   return [{day:chinaDay,sales:daily.todaySales==null?data.chinaToday.salesCents:Math.round(daily.todaySales*100),visits:daily.todayVisitors??data.chinaToday.visits}]
  }
  const end=new Date((data?.today||new Date().toISOString().slice(0,10))+'T00:00:00Z')
  const chartEnd=Date.parse(config?.chartEndDate+'T00:00:00Z')
  function configuredValue(track,date){
   const offset=(chartEnd-date.getTime())/86400000
   return Array.isArray(track)?track[track.length-1-offset]:undefined
  }
  return Array.from({length:days},(_,i)=>{
   const date=new Date(end)
   date.setUTCDate(date.getUTCDate()-days+1+i)
   const day=date.toISOString().slice(0,10)
   const sales=configuredValue(config?.salesTrack,date)
   return {day,sales:sales==null?(data?.daily.find(row=>row.day===day)?.salesCents??0):Math.round(sales*100),visits:configuredValue(config?.visitsTrack,date)??data?.visits.find(row=>row.day===day)?.visits??0}
  })
 },[data,days])
 const maxSales=Math.max(100,...series.map(d=>d.sales)),maxVisits=Math.max(1,...series.map(d=>d.visits))
 const activeHeatDay=series.find(row=>row.day===heatDay)??series.at(-1)
 const today=data?.today,visits=(length)=>{const end=new Date((today||'2000-01-01')+'T00:00:00Z');end.setUTCDate(end.getUTCDate()-length+1);const from=end.toISOString().slice(0,10);return (data?.visits||[]).filter(v=>v.day>=from&&v.day<=today).reduce((s,v)=>s+v.visits,0)}
 const todayData=data?.chinaToday
 const metrics=data?.dashboardMetrics??{}
 const dailyMetrics=metrics.dailyDay&&metrics.dailyDay===data?.chinaDay?metrics:{}
 const number=value=>value==null?'—':Number(value).toLocaleString()
 const dollars=value=>value==null?'—':money(Math.round(value*100))
 const totalSales=metrics.totalSalesAmount??(data&&(data.overview.salesCents+(data.historicalSales?.salesCents||0))/100)
 const todaySales=dailyMetrics.todaySales??(todayData?(todayData.salesCents??0)/100:null)
 const profit=(override,sales,fundingCents,rate)=>override!=null
  ? dollars(override)
  : sales==null||fundingCents==null?'—':money(Math.round((Math.round(sales*100)+Number(fundingCents))*rate/100))
 const totals=[
  ['Total Products',number(metrics.totalProducts??data?.overview.products),'bg-[#ff8099] text-slate-950'],
  ['Total Sales Amount',dollars(totalSales),'bg-[#72c1f8] text-slate-950'],
  ['Total Orders',number(metrics.totalOrders??data?.overview.paidOrders),'bg-[#758df5] text-slate-950'],
  ['Total Profit',profit(metrics.totalProfit,totalSales,data?.funding?.total_cents,20),'bg-[#58d2c9] text-slate-950'],
 ]
 const bestSellers=metrics.topProducts?.length
  ? metrics.topProducts.flatMap(({productId,salesVolume})=>{
    const product=products.find(item=>Number(item.id)===Number(productId))
    const recorded=data?.products.find(item=>Number(item.id)===Number(productId))
    return product&&salesVolume>0?[{...product,units:salesVolume,salesCents:recorded?.salesCents}]:[]
   }).sort((first,second)=>second.units-first.units)
  : data?.products.filter(product=>product.units>0)||[]
 const groups=[
  ['Shop Overview',[
   ['Overall Rating',number(metrics.overallRating??(data?.overallRating==null?null:Number(data.overallRating).toFixed(2)))],
   ['Seller Credit Score',number(creditScore??metrics.sellerCreditScore??(data?5:null))],
   ['Store Followers',number(data?.overview.followers)],
  ]],
  ['Visitor Statistics',[
   ['Today’s Visitors',number(dailyMetrics.todayVisitors??todayData?.visits)],
   ['Total store visits',number(data?.overview.visits)],
   ['Last 7 days',number(metrics.visitorsLast7Days??(data?visits(7):null))],
   ['Last 30 days',number(metrics.visitorsLast30Days??(data?visits(30):null))],
  ]],
  ['Today’s Statistics',[
   ['Today’s Orders',number(dailyMetrics.todayOrders??todayData?.orders)],
   ['Today’s Sales',dollars(todaySales)],
   ['Estimated Profit',profit(dailyMetrics.estimatedProfit,todaySales,data?.funding?.today_cents,15)],
  ]],
 ]
 return <SellerWorkspace user={user}><h1 className="portal-title">{t("Store overview")}</h1>{error&&<p role="alert" className="portal-error">{error}</p>}
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
   {heading==='Today’s Statistics'&&<p className="mt-1 text-xs text-slate-600">{t("Resets at midnight China time")}</p>}
   <dl className="mt-4 grid grid-cols-3 gap-2">
    {figures.map(([label,value])=><div key={label} className="min-w-0">
     <dt className="text-xs text-slate-600">{t(label)}</dt>
     <dd className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-900 sm:text-base">{value}</dd>
    </div>)}
   </dl>
  </section>)}
 </div>
 <section className="portal-card" aria-label={t("Store activity heatmap")}>
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><h2>{t("Store activity heatmap")}</h2><p className="mt-1 text-xs text-slate-600">{t(days===1?"China time":"UTC")}</p></div>
   <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Heatmap period")}>
    {[[1,'Today'],[7,'Last 7 days'],[30,'Last 30 days']].map(([n,label])=><button key={n} type="button" aria-pressed={days===n} onClick={()=>{setDays(n);setHeatDay('')}} className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold ${days===n?'bg-orange-700 text-white':'bg-slate-100 text-slate-700'}`}>{t(label)}</button>)}
   </div>
  </div>
  <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
   <div className="min-w-0 space-y-3">
    {[['sales','Sales',maxSales,'rgba(234,88,12,'],['visits','Visits',maxVisits,'rgba(180,83,9,']].map(([key,label,max,color])=><div key={key} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-2">
     <p className="text-xs font-semibold text-slate-700">{t(label)}</p>
     <div className={`grid gap-1 ${days===30?'grid-cols-10':days===7?'grid-cols-7':'grid-cols-1'}`}>
      {series.map(row=>{
       const value=key==='sales'?money(row.sales):number(row.visits)
       const description=`${row.day} · ${t(label)} ${value}`
       return <button key={row.day} type="button" aria-label={description} title={description} onClick={()=>setHeatDay(row.day)} aria-pressed={activeHeatDay?.day===row.day}
        className="min-h-6 rounded border border-slate-200 aria-pressed:ring-2 aria-pressed:ring-slate-800 focus-visible:outline-2 focus-visible:outline-orange-700"
        style={{backgroundColor:row[key]>0?`${color}${0.18+0.82*row[key]/max})`:'#fff7ed'}}/>
      })}
     </div>
    </div>)}
    {activeHeatDay&&<p aria-live="polite" className="text-xs text-slate-600">{activeHeatDay.day} · {t('Sales')} {money(activeHeatDay.sales)} · {t('Visits')} {number(activeHeatDay.visits)}</p>}
   </div>
   <div className="rounded-xl bg-orange-50 px-4 py-3 text-orange-950">
    <p className="text-xs font-semibold">{t("Store Followers")}</p>
    <p className="mt-1 text-xl font-bold tabular-nums">{number(data?.overview.followers)}</p>
   </div>
  </div>
 </section>
 <section className="portal-card portal-shortcuts" aria-label="Store tools">{shortcuts.map(([Icon,label,to,color])=><Link key={to} to={to}><i style={{background:color}}><Icon size={23}/></i><span>{t(label)}</span></Link>)}</section>
 <SaleConfirmations sales={data?.orders||[]} onConfirmed={async()=>setData(await apiRequest('/api/seller/analytics'))}/><section className="portal-card"><div className="portal-section-head"><h2>{t("Recent orders")}</h2><Link to="/seller/orders">{t("View all")}</Link></div>{data?.orders.slice(0,4).map(o=><Link className="portal-order-row" key={o.orderId} to={`/seller/orders?order=${o.orderNumber}`}><div><strong>{formatOrderReference(o)}</strong><OrderStatusBadge status={o.paymentStatus} label={t(paymentStatusLabel(o.paymentStatus))}/></div><strong>{money(o.amountCents)}</strong></Link>)}{data&&!data.orders.length&&<p className="portal-empty">{t("No orders yet.")}</p>}</section>
 <section className="portal-card"><h2>{t("Top 10 best-selling items")}</h2><div className="portal-product-list">{bestSellers.map((p,i)=><Link to={products.some(item=>item.id===p.id&&item.isPublished)?`/products/${p.id}`:'/seller/products'} key={p.id||i} className="portal-product-row">{p.imageUrl?<img src={p.imageUrl} alt="" loading="lazy"/>:<span className="portal-image-placeholder"><Package/></span>}<div><h3>{p.name}</h3><p>{p.units} {t('sold')}</p><strong>{p.salesCents!=null&&<>{money(p.salesCents)} <small>{t("sales")}</small></>}</strong></div></Link>)}</div>{data&&!bestSellers.length&&<p className="portal-empty">{t("Your best-selling items will appear after completed payments.")}</p>}</section>
 <section className="portal-card"><div className="portal-section-head"><h2>{t('Store products')}</h2><Link to="/seller/products">{t("Manage")}</Link></div><div className="portal-product-list">{products.slice(0,limit).map(p=><Link to={p.isPublished?`/products/${p.id}`:'/seller/products'} className="portal-product-row" key={p.id}><img src={p.imageUrl} alt="" loading="lazy"/><div><h3>{p.name}</h3><p>{p.category}</p><strong>{money(Math.round(p.price*100))}</strong></div></Link>)}</div>{products.length>limit&&<button className="portal-load-more" onClick={()=>setLimit(n=>n+24)}>{t("Show more products")}</button>}{!products.length&&<Link className="portal-empty" to="/seller/warehouse">{t("Browse the warehouse to add products.")}</Link>}</section>{data?.dates?.establishedOn&&<div className="portal-dates"><StoreDates {...data.dates}/></div>}
 </SellerWorkspace>
}
