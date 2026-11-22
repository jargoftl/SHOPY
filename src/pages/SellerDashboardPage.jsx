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
const heatmapDays=Array.from({length:31},(_,index)=>index+1)
const heatmapMonths=Array.from({length:12},(_,index)=>11-index)
const heatmapColors=['#fff4df','#ffdb71','#ffc038','#ff9a16','#fb720d','#e9450a','#bf2d05']
const monthName=new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'})

export default function SellerDashboardPage(){
 const {t}=useSellerLanguage()
 const [user,setUser]=useState(null),[data,setData]=useState(null),[products,setProducts]=useState([]),[error,setError]=useState(''),[creditScore,setCreditScore]=useState(null),[heatMetric,setHeatMetric]=useState('visits'),[heatYear,setHeatYear]=useState(null),[heatDay,setHeatDay]=useState(''),[limit,setLimit]=useState(12)
 useEffect(()=>{let active=true;const refresh=()=>Promise.all([apiRequest('/api/auth/me'),apiRequest('/api/seller/analytics')]).then(([u,d])=>{if(active){setUser(u.user);setData(d);setError('')}}).catch(e=>active&&setError(e.message));apiRequest('/api/seller/products').then(d=>active&&setProducts(d.products)).catch(e=>active&&setError(e.message));const tick=()=>{if(document.hidden)return;refresh();apiRequest('/api/seller/dashboard-metrics',{cache:'no-store'}).then(({metrics})=>{if(active)setCreditScore(metrics.sellerCreditScore??5)}).catch(()=>{})};tick();const timer=setInterval(tick,30000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick)}},[])
 const currentDate=data?.today||new Date().toISOString().slice(0,10)
 const currentYear=Number(currentDate.slice(0,4))
 const year=heatYear??currentYear
 const heatmap=useMemo(()=>{
  const rows=new Map()
  for(const row of data?.daily||[])rows.set(row.day,{sales:row.salesCents,visits:0})
  for(const row of data?.visits||[])rows.set(row.day,{...rows.get(row.day),visits:row.visits})
  const config=data?.dashboardMetrics
  for(const [key,track] of [['sales',config?.salesTrack],['visits',config?.visitsTrack]]){
   if(!Array.isArray(track)||!config.chartEndDate)continue
   track.forEach((value,index)=>{
    const date=new Date(config.chartEndDate+'T00:00:00Z')
    date.setUTCDate(date.getUTCDate()+index-track.length+1)
    const day=date.toISOString().slice(0,10)
    rows.set(day,{...rows.get(day),[key]:key==='sales'?Math.round(value*100):value})
   })
  }
  return rows
 },[data])
 const heatYears=[...new Set([currentYear,...Array.from(heatmap.keys(),day=>Number(day.slice(0,4)))])].sort((a,b)=>b-a)
 const heatMaximum=Math.max(1,...[...heatmap].filter(([day])=>day.startsWith(String(year))&&day<=currentDate).map(([,row])=>row[heatMetric]??0))
 const activeHeatDay=heatDay|| (year===currentYear?currentDate:`${year}-12-31`)
 const selectedHeatValues=heatmap.get(activeHeatDay)
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
  <div className="flex flex-wrap items-center justify-between gap-3">
   <h2>{t("Store activity heatmap")}</h2>
   <div className="flex flex-wrap items-center gap-2">
    <div className="flex gap-1 rounded-lg bg-orange-50 p-1" role="group" aria-label={t("Heatmap metric")}>
     {[['visits','Visits'],['sales','Sales']].map(([key,label])=><button key={key} type="button" aria-pressed={heatMetric===key} onClick={()=>setHeatMetric(key)}
      className={`min-h-8 rounded-md px-3 text-xs font-semibold ${heatMetric===key?'bg-orange-700 text-white':'text-orange-950'}`}>{t(label)}</button>)}
    </div>
    <select aria-label={t("Heatmap year")} value={year} onChange={event=>{setHeatYear(Number(event.target.value));setHeatDay('')}} className="rounded-lg border px-2 text-sm">
     {heatYears.map(value=><option key={value}>{value}</option>)}
    </select>
   </div>
  </div>
  <div className="mt-4 overflow-x-auto rounded-lg border border-orange-100" tabIndex={0} aria-label={t("Monthly heatmap grid")}>
   <table className="w-full min-w-[620px] table-fixed border-separate border-spacing-px text-center text-[10px]">
    <thead className="sr-only"><tr><th scope="col">{t("Month")}</th>{heatmapDays.map(day=><th scope="col" key={day}>{day}</th>)}</tr></thead>
    <tbody>{heatmapMonths.map(month=>{
     const monthDate=new Date(Date.UTC(year,month,1))
     const daysInMonth=new Date(Date.UTC(year,month+1,0)).getUTCDate()
     return <tr key={month}>
      <th scope="row" className="w-10 whitespace-nowrap bg-white font-medium text-slate-700">{monthName.format(monthDate)}</th>
      {heatmapDays.map(day=>{
       const date=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
       if(day>daysInMonth||date>currentDate)return <td key={day} className="h-5 bg-slate-100"/>
       const value=heatmap.get(date)?.[heatMetric]??0
       const shade=value>0?Math.max(1,Math.ceil(value/heatMaximum*(heatmapColors.length-1))):0
       const description=`${date} · ${heatMetric==='sales'?money(value):number(value)+' '+t('Visits')}`
       return <td key={day} className="p-0"><button type="button" aria-label={description} title={description} aria-pressed={date===activeHeatDay} onClick={()=>setHeatDay(date)}
        style={{backgroundColor:heatmapColors[shade]}} className="block h-5 w-full outline-offset-[-2px] aria-pressed:outline-2 aria-pressed:outline-orange-950 focus-visible:outline-2 focus-visible:outline-slate-900"/></td>
      })}
     </tr>
    })}</tbody>
    <tfoot aria-hidden="true"><tr><td className="w-10"/>{heatmapDays.map(day=><td key={day} className="py-1 text-slate-700">{day}</td>)}</tr></tfoot>
   </table>
  </div>
  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
   <p aria-live="polite">{activeHeatDay} (UTC) · {t('Sales')} {money(selectedHeatValues?.sales??0)} · {t('Visits')} {number(selectedHeatValues?.visits??0)}</p>
   <div className="flex items-center gap-1" aria-label={t('Heatmap scale')}>{t('Low')}{heatmapColors.map(color=><span key={color} className="size-3 rounded-sm" style={{backgroundColor:color}}/>)}{t('High')}</div>
   <p className="rounded-lg bg-orange-50 px-3 py-2 text-orange-950">{t("Store Followers")} <strong className="ml-1 tabular-nums">{number(data?.overview.followers)}</strong></p>
  </div>
 </section>
 <section className="portal-card portal-shortcuts" aria-label="Store tools">{shortcuts.map(([Icon,label,to,color])=><Link key={to} to={to}><i style={{background:color}}><Icon size={23}/></i><span>{t(label)}</span></Link>)}</section>
 <SaleConfirmations sales={data?.orders||[]} onConfirmed={async()=>setData(await apiRequest('/api/seller/analytics'))}/><section className="portal-card"><div className="portal-section-head"><h2>{t("Recent orders")}</h2><Link to="/seller/orders">{t("View all")}</Link></div>{data?.orders.slice(0,4).map(o=><Link className="portal-order-row" key={o.orderId} to={`/seller/orders?order=${o.orderNumber}`}><div><strong>{formatOrderReference(o)}</strong><OrderStatusBadge status={o.paymentStatus} label={t(paymentStatusLabel(o.paymentStatus))}/></div><strong>{money(o.amountCents)}</strong></Link>)}{data&&!data.orders.length&&<p className="portal-empty">{t("No orders yet.")}</p>}</section>
 <section className="portal-card"><h2>{t("Top 10 best-selling items")}</h2><div className="portal-product-list">{bestSellers.map((p,i)=><Link to={products.some(item=>item.id===p.id&&item.isPublished)?`/products/${p.id}`:'/seller/products'} key={p.id||i} className="portal-product-row">{p.imageUrl?<img src={p.imageUrl} alt="" loading="lazy"/>:<span className="portal-image-placeholder"><Package/></span>}<div><h3>{p.name}</h3><p>{p.units} {t('sold')}</p><strong>{p.salesCents!=null&&<>{money(p.salesCents)} <small>{t("sales")}</small></>}</strong></div></Link>)}</div>{data&&!bestSellers.length&&<p className="portal-empty">{t("Your best-selling items will appear after completed payments.")}</p>}</section>
 <section className="portal-card"><div className="portal-section-head"><h2>{t('Store products')}</h2><Link to="/seller/products">{t("Manage")}</Link></div><div className="portal-product-list">{products.slice(0,limit).map(p=><Link to={p.isPublished?`/products/${p.id}`:'/seller/products'} className="portal-product-row" key={p.id}><img src={p.imageUrl} alt="" loading="lazy"/><div><h3>{p.name}</h3><p>{p.category}</p><strong>{money(Math.round(p.price*100))}</strong></div></Link>)}</div>{products.length>limit&&<button className="portal-load-more" onClick={()=>setLimit(n=>n+24)}>{t("Show more products")}</button>}{!products.length&&<Link className="portal-empty" to="/seller/warehouse">{t("Browse the warehouse to add products.")}</Link>}</section>{data?.dates?.establishedOn&&<div className="portal-dates"><StoreDates {...data.dates}/></div>}
 </SellerWorkspace>
}
