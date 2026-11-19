import '../styles/seller-portal.css'
import {useEffect,useState} from 'react'
import {NavLink,useLocation} from 'react-router-dom'
import {Store,Package,ClipboardList,MessageCircle,UserRound} from 'lucide-react'
import {apiRequest} from '../lib/api.js'
const tabs=[['/seller','Store',Store],['/seller/products','Products',Package],['/seller/orders','Orders',ClipboardList],['/messages','Messages',MessageCircle],['/seller/account','My',UserRound]]
export default function SellerBottomNav(){
 const {pathname}=useLocation(),[account,setAccount]=useState(null)
 const eligible=pathname.startsWith('/seller')&&!['/seller/login','/seller/register','/seller/application'].includes(pathname)||pathname==='/messages'
 useEffect(()=>{if(!eligible)return;let active=true;apiRequest('/api/auth/me',{background:true}).then(d=>active&&setAccount(d.user)).catch(()=>active&&setAccount(null));return()=>{active=false}},[eligible,pathname])
 if(!eligible||account?.role!=='seller')return null
 return <><nav className="seller-bottom-tabs" aria-label="Workspace tabs">{tabs.map(([to,label,Icon])=><NavLink key={to} to={to} end={to==='/seller'} className={({isActive})=>isActive||label==='Products'&&['/seller/warehouse','/seller/refunds','/seller/reviews'].includes(pathname)||label==='My'&&['/seller/wallet','/seller/fund-record','/seller/financial-statement'].includes(pathname)?'is-active':''}><Icon size={23} strokeWidth={1.7}/><span>{label}</span></NavLink>)}</nav><LinkStamp/></>
}
function LinkStamp(){return <span className="seller-brand-stamp" title="tiktokshop"><img src="/brand-logo.svg" alt="tiktokshop" width="20" height="24"/></span>}
