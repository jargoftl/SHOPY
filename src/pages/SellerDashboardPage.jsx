import UiverseSelect from '../components/UiverseSelect.jsx'
import '../styles/seller-overview.css'
import { formatOrderReference } from '../lib/orderReference.js'
import {useSellerLanguage} from '../context/SellerLanguageContext.jsx'
import {useEffect,useMemo,useState} from 'react'
import {Link} from 'react-router-dom'
import {ArrowUpRight,Package,Star,BadgeCheck,Users,ChevronDown,ChartPie} from 'lucide-react'
import SellerWorkspace,{money} from '../components/SellerWorkspace.jsx'
import SaleConfirmations from '../components/SaleConfirmations.jsx'
import StoreDates from '../components/StoreDates.jsx'
import OrderStatusBadge from '../components/OrderStatusBadge.jsx'
import {paymentStatusLabel} from '../lib/fulfillment.js'
import {apiRequest} from '../lib/api.js'
const monthColors=['#bc4211','#eb7924','#ffbd6d','#d45d34','#9b4b31','#efa052','#775449','#cc8831','#a74f64','#c3736c','#ff9e37','#914016']

export default function SellerDashboardPage(){
 const {language,t}=useSellerLanguage()
 const [user,setUser]=useState(null),[data,setData]=useState(null),[products,setProducts]=useState([]),[error,setError]=useState(''),[creditScore,setCreditScore]=useState(null),[chartMetric,setChartMetric]=useState('visits'),[chartYear,setChartYear]=useState(null),[limit,setLimit]=useState(12)
 useEffect(()=>{let active=true;const refresh=()=>Promise.all([apiRequest('/api/auth/me'),apiRequest('/api/seller/analytics')]).then(([u,d])=>{if(active){setUser(u.user);setData(d);setError('')}}).catch(e=>active&&setError(e.message));apiRequest('/api/seller/products').then(d=>active&&setProducts(d.products)).catch(e=>active&&setError(e.message));const tick=()=>{if(document.hidden)return;refresh();apiRequest('/api/seller/dashboard-metrics',{cache:'no-store'}).then(({metrics})=>{if(active)setCreditScore(metrics.sellerCreditScore??5)}).catch(()=>{})};tick();const timer=setInterval(tick,30000);window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick)}},[])
 const currentDate=data?.today||new Date().toISOString().slice(0,10)
 const currentYear=Number(currentDate.slice(0,4))
 const year=chartYear??currentYear
 const activityByDay=useMemo(()=>{
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
 const chartYears=[...new Set([currentYear,...Array.from(activityByDay.keys(),day=>Number(day.slice(0,4)))])].sort((a,b)=>b-a)
 const monthlyTotals=Array(12).fill(0)
 for(const [day,row] of activityByDay){
  if(day.startsWith(`${year}-`)&&day<=currentDate)monthlyTotals[Number(day.slice(5,7))-1]+=row[chartMetric]??0
 }
 const monthName=new Intl.DateTimeFormat(language,{month:'short',timeZone:'UTC'})
 const recordedMonths=monthlyTotals.flatMap((value,index)=>value>0?[{
  value,color:monthColors[index],label:monthName.format(new Date(Date.UTC(year,index,1))),
 }]:[])
 const recordedTotal=recordedMonths.reduce((sum,month)=>sum+month.value,0)
 const showStoreVisitTotal=chartMetric==='visits'&&year===currentYear&&data?.overview.visits!=null
 const chartTotal=showStoreVisitTotal?Number(data.overview.visits):recordedTotal
 // Only show monthly shares that fit within the saved store total.
 const chartMonths=showStoreVisitTotal&&recordedTotal>chartTotal?[]:recordedMonths
 const remainingVisits=showStoreVisitTotal?chartTotal-(recordedTotal>chartTotal?0:recordedTotal):0
 const chartSegments=remainingVisits>0
  ? [...chartMonths,{ value:remainingVisits,color:'#b96639',label:t(chartMonths.length?'Other visits':'Total store visits') }]
  : chartMonths
 let chartOffset=0
 const chartStops=chartSegments.map(month=>{
  const start=chartOffset
  chartOffset+=month.value
  return `${month.color} ${100*start/chartTotal}% ${100*chartOffset/chartTotal}%`
 })
 const formatChartValue=value=>chartMetric==='sales'?money(value):value.toLocaleString(language)
 const today=data?.today,visits=(length)=>{const end=new Date((today||'2000-01-01')+'T00:00:00Z');end.setUTCDate(end.getUTCDate()-length+1);const from=end.toISOString().slice(0,10);return (data?.visits||[]).filter(v=>v.day>=from&&v.day<=today).reduce((s,v)=>s+v.visits,0)}
 const todayData=data?.chinaToday
 const metrics=data?.dashboardMetrics??{}
 const dailyMetrics=metrics.dailyDay&&metrics.dailyDay===data?.chinaDay?metrics:{}
 const number=value=>value==null?'—':Number(value).toLocaleString()
 const dollars=value=>value==null?'—':money(Math.round(value*100))
 const totalSales=metrics.totalSalesAmount??(data&&(data.overview.salesCents+(data.historicalSales?.salesCents||0))/100)
 const todaySales=dailyMetrics.todaySales??(todayData?((todayData.salesCents??0)+(data.historicalSales?.todaySalesCents??0))/100:null)
 const profit=(override,sales,fundingCents,rate)=>override!=null
  ? dollars(override)
  : sales==null||fundingCents==null?'—':money(Math.round((Math.round(sales*100)+Number(fundingCents))*rate/100))
 const totals=[
  ['Total Products',number(metrics.totalProducts??data?.overview.products),''],
  ['Total Sales Amount',dollars(totalSales),'seller-overview-hero'],
  ['Total Orders',number(metrics.totalOrders??(data?data.overview.paidOrders+(data.historicalSales?.orders??0):null)),''],
  ['Total Profit',profit(metrics.totalProfit,totalSales,data?.funding?.total_cents,20),''],
 ]
 const bestSellers=metrics.topProducts?.length
  ? metrics.topProducts.flatMap(({productId,salesVolume})=>{
    const product=products.find(item=>Number(item.id)===Number(productId))
    const recorded=data?.products.find(item=>Number(item.id)===Number(productId))
    return product&&salesVolume>0?[{...product,units:salesVolume,salesCents:recorded?.salesCents}]:[]
   }).sort((first,second)=>second.units-first.units)
  : data?.products.filter(product=>product.units>0)||[]
 const groups=[
  ['Visitor Statistics',[
   ['Today’s Visitors',number(dailyMetrics.todayVisitors??todayData?.visits)],
   ['Total store visits',number(data?.overview.visits)],
   ['Last 7 days',number(metrics.visitorsLast7Days??(data?visits(7):null))],
   ['Last 30 days',number(metrics.visitorsLast30Days??(data?visits(30):null))],
  ]],
  ['Today’s Statistics',[
   ['Today’s Orders',number(dailyMetrics.todayOrders??(todayData?todayData.orders+(data.historicalSales?.todayOrders??0):null))],
   ['Today’s Sales',dollars(todaySales)],
   ['Estimated Profit',profit(dailyMetrics.estimatedProfit,todaySales,data?.funding?.today_cents,15)],
  ]],
 ]
 return <SellerWorkspace user={user} overview>
 <div className="seller-overview-heading">
  <h1 className="portal-title">{t("Store overview")}</h1>
  <div className="seller-overview-actions">
   <Link to="/seller/orders"><Package size={16} aria-hidden="true"/>{t("Shop orders")}</Link>
   <Link to="/seller/wallet">{t("My wallet")}<ArrowUpRight size={16} aria-hidden="true"/></Link>
  </div>
 </div>{error&&<p role="alert" className="portal-error">{error}</p>}
 <section className="seller-overview-totals" aria-label={t('Dashboard totals')}>
  <dl className="seller-overview-summary">
   {totals.map(([label,value,color])=><div key={label} className={`seller-overview-metric ${color}`}>
    <dt className="text-xs font-medium sm:text-sm">{t(label)}</dt>
    <dd className="seller-overview-value tabular-nums">{value}</dd>
   </div>)}
  </dl>
 </section>
 <details className="portal-card seller-activity-chart">
  <summary>
   <ChartPie size={19} aria-hidden="true"/><span>{t('Sales & visits')}</span><ChevronDown size={18} aria-hidden="true"/>
  </summary>
  <div className="seller-activity-content">
   <div className="flex flex-wrap items-center justify-between gap-2">
    <div className="seller-activity-switch" role="group" aria-label={t('Chart metric')}>
     {[['visits','Visits'],['sales','Sales']].map(([key,label])=><button key={key} type="button" aria-pressed={chartMetric===key} onClick={()=>setChartMetric(key)}>{t(label)}</button>)}
    </div>
    <UiverseSelect aria-label={t('Chart year')} value={year} onChange={event=>setChartYear(Number(event.target.value))} className="seller-overview-select">
     {chartYears.map(value=><option key={value} value={value}>{value}</option>)}
    </UiverseSelect>
   </div>
   <div className="seller-activity-breakdown">
    <div className="seller-activity-ring" style={chartTotal?{backgroundImage:`conic-gradient(${chartStops.join(', ')})`}:undefined}>
     <div aria-live="polite"><strong>{formatChartValue(chartTotal)}</strong><span>{showStoreVisitTotal?t('Total store visits'):`${t(chartMetric==='sales'?'Sales':'Visits')} · ${year}`}</span></div>
    </div>
    {chartSegments.length>0?<ul className="seller-activity-legend" aria-label={t('Monthly breakdown')}>
     {chartSegments.map(month=><li key={month.label}>
      <span aria-hidden="true" style={{backgroundColor:month.color}}/>{month.label}<strong>{formatChartValue(month.value)}</strong>
     </li>)}
    </ul>:<p className="text-sm">{t('No recorded activity for this year.')}</p>}
   </div>
  </div>
 </details>
 <dl className="seller-shop-rows" aria-label={t('Shop overview')}>
  {[
   [Users,'Store Followers',number(data?.overview.followers),'#b85123'],
   [Star,'Overall Rating',number(metrics.overallRating??(data?.overallRating==null?null:Number(data.overallRating).toFixed(2))),'#396bbc'],
   [BadgeCheck,'Seller Credit Score',number(creditScore??metrics.sellerCreditScore??(data?5:null)),'#1f8063'],
   [Package,'Total items sold',number(data?(data.overview.unitsSold??0)+(data.historicalSales?.units??0):null),'#5966af'],
  ].map(([Icon,label,value,color])=><div className="seller-shop-row" key={label}>
   <dt><span style={{backgroundColor:color}}><Icon size={18} aria-hidden="true"/></span>{t(label)}</dt>
   <dd>{value}</dd>
  </div>)}
 </dl>
 <div className="seller-overview-statistics">
  {groups.map(([heading,figures])=><section key={heading} className="portal-card min-w-0">
   <h2>{t(heading)}</h2>
   <dl className="seller-overview-stat-values">
    {figures.map(([label,value])=><div key={label} className="min-w-0">
     <dt className="text-xs text-slate-600">{t(label)}</dt>
     <dd className="mt-1 break-words text-sm font-semibold tabular-nums text-slate-900 sm:text-base">{value}</dd>
    </div>)}
   </dl>
  </section>)}
 </div>
 <SaleConfirmations sales={data?.orders||[]} onConfirmed={async()=>setData(await apiRequest('/api/seller/analytics'))}/><section className="portal-card"><div className="portal-section-head"><h2>{t("Recent orders")}</h2><Link to="/seller/orders">{t("View all")}</Link></div>{data?.orders.slice(0,4).map(o=><Link className="portal-order-row" key={o.orderId} to={`/seller/orders?order=${o.orderNumber}`}><div><strong>{formatOrderReference(o)}</strong><OrderStatusBadge status={o.paymentStatus} label={t(paymentStatusLabel(o.paymentStatus))}/></div><strong>{money(o.amountCents)}</strong></Link>)}{data&&!data.orders.length&&<p className="portal-empty">{t("No orders yet.")}</p>}</section>
 <section className="portal-card"><h2>{t("Top 10 best-selling items")}</h2><div className="portal-product-list">{bestSellers.map((p,i)=><Link to={products.some(item=>item.id===p.id&&item.isPublished)?`/products/${p.id}`:'/seller/products'} key={p.id||i} className="portal-product-row">{p.imageUrl?<img src={p.imageUrl} alt="" loading="lazy"/>:<span className="portal-image-placeholder"><Package/></span>}<div><h3>{p.name}</h3><p>{p.units} {t('sold')}</p><strong>{p.salesCents!=null&&<>{money(p.salesCents)} <small>{t("sales")}</small></>}</strong></div></Link>)}</div>{data&&!bestSellers.length&&<p className="portal-empty">{t("Your best-selling items will appear after completed payments.")}</p>}</section>
 <section className="portal-card"><div className="portal-section-head"><h2>{t('Store products')}</h2><Link to="/seller/products">{t("Manage")}</Link></div><div className="portal-product-list">{products.slice(0,limit).map(p=><Link to={p.isPublished?`/products/${p.id}`:'/seller/products'} className="portal-product-row" key={p.id}><img src={p.imageUrl} alt="" loading="lazy"/><div><h3>{p.name}</h3><p>{p.category}</p><strong>{money(Math.round(p.price*100))}</strong></div></Link>)}</div>{products.length>limit&&<button className="portal-load-more" onClick={()=>setLimit(n=>n+24)}>{t("Show more products")}</button>}{!products.length&&<Link className="portal-empty" to="/seller/warehouse">{t("Browse the warehouse to add products.")}</Link>}</section>{data?.dates?.establishedOn&&<div className="portal-dates"><StoreDates {...data.dates}/></div>}
 </SellerWorkspace>
}
