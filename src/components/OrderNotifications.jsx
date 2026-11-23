import {tabScope} from '../lib/tabSession.js'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { formatMoney } from '../lib/money.js'
import { apiRequest } from '../lib/api.js'

import { timestampMillis } from '../lib/storeDates.js'

const orderPopupWindow = 5 * 60 * 1000
function paidOrderNumber(item, role) {
  if (item.type !== 'purchase' || !item.link?.startsWith('/')) return null
  const link = new URL(item.link, window.location.origin)
  const sellerPayment = role === 'seller' && link.pathname === '/seller/orders' &&
    (item.body === 'Paid' || /^Order #\d+ payment confirmed$/.test(item.title))
  const adminPayment = role === 'admin' && link.pathname === '/admin' && link.hash === '#purchase-orders' &&
    item.title.startsWith('Paid · Order #')
  return sellerPayment || adminPayment ? link.searchParams.get('order') : null
}

function readShownOrders(key) {
  try {
    const ids = JSON.parse(localStorage.getItem(key) || '[]')
    return new Set(Array.isArray(ids) ? ids : [])
  } catch {
    return new Set()
  }
}

function SellerOrderPreview({orderNumber,link,onClose}){
  const dialog=useRef(null)
  const [order,setOrder]=useState(null)
  const [loading,setLoading]=useState(true)
  useEffect(()=>{
    const node=dialog.current
    node.showModal()
    return()=>node.close()
  },[])
  useEffect(()=>{
    let active=true
    apiRequest('/api/seller/purchases',{background:true})
      .then(({orders})=>{if(active)setOrder(orders?.find(item=>String(item.orderNumber)===orderNumber))})
      .catch(()=>{})
      .finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[orderNumber])
  return <dialog ref={dialog} aria-labelledby="seller-order-preview-title"
    onCancel={event=>{event.preventDefault();onClose()}} className="seller-order-preview">
    <header>
      <div><h2 id="seller-order-preview-title">New paid order</h2><p>Order #{orderNumber}</p></div>
      <button type="button" onClick={onClose} aria-label="Dismiss order preview"><X size={20} aria-hidden="true"/></button>
    </header>
    {loading?<p role="status">Loading items…</p>:order?<ul>
      {order.items.map(item=><li key={item.id}>
        {item.imageUrl&&<img src={item.imageUrl} alt=""/>}
        <span>{item.name}<small>{[item.color,item.size].filter(Boolean).join(' · ')}</small></span>
        <strong>{item.quantity} × {formatMoney(item.priceCents)}</strong>
      </li>)}
    </ul>:<p>Open the order to see its items.</p>}
    <footer>
      {order&&<span>Total <strong>{formatMoney(order.subtotalCents)}</strong></span>}
      <Link to={link} onClick={onClose}>Review order</Link>
    </footer>
  </dialog>
}

export default function OrderNotifications() {
  const location = useLocation()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [unread, setUnread] = useState(0)
  const [toast, setToast] = useState(null)
  const [error, setError] = useState('')
  const seen = useRef(new Set())
  const currentUser = useRef(null)
  const routeToast = useRef(null)
  const previewOpen = useRef(false)
  previewOpen.current = Boolean(toast?.orderPreview)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      const scope=tabScope()
      try {
        const { user: account } = await apiRequest('/api/auth/me', { background: true })
        if (!active||scope!==tabScope()) return
        if (currentUser.current !== account.id) {
          currentUser.current = account.id
          seen.current.clear()
          setToast(null)
        }
        setUser(account)
        const data = await apiRequest('/api/notifications', { background: true })
        if (!active||scope!==tabScope()) return
        setUnread(data.unreadCount)
        setError('')
        if (document.hidden || previewOpen.current) return
        const shownKey = `paid-order-popups:${account.role}:${account.id}`
        const shownOrders = readShownOrders(shownKey)
        const legacy = account.role === 'seller' ? readShownOrders(`seller-order-popups:${account.id}`) : new Set()
        for (const item of data.notifications) {
          if (!legacy.has(item.id)) continue
          const orderNumber = paidOrderNumber(item, account.role)
          if (orderNumber) shownOrders.add(orderNumber)
        }
        const sellerPage = location.pathname === '/seller' || location.pathname.startsWith('/seller/')
        for (const item of data.notifications) {
          if (item.isRead || seen.current.has(item.id)) continue
          const orderNumber = paidOrderNumber(item, account.role)
          if (item.type === 'purchase' && (account.role === 'seller' || account.role === 'admin')) {
            const created = timestampMillis(item.createdAt)
            if (!orderNumber || (account.role === 'seller' && !sellerPage) ||
                !Number.isFinite(created) || Date.now() - created > orderPopupWindow ||
                shownOrders.has(orderNumber) || seen.current.has(`order:${orderNumber}`)) continue
            shownOrders.add(orderNumber)
            seen.current.add(`order:${orderNumber}`)
            try { localStorage.setItem(shownKey, JSON.stringify([...shownOrders].slice(-200))) } catch { /* Use in-memory tracking. */ }
          } else if (item.type !== 'reward' &&
              !(item.type === 'purchase' && (item.link?.startsWith('/purchase/') || item.link === '/orders'))) continue
          seen.current.add(item.id)
          const title = orderNumber ? `Paid · Order #${orderNumber}` : item.title
          setToast({ title, orderPreview: account.role==='seller'?orderNumber:null, body: orderNumber ? '' : item.body, link: item.link, linkLabel: item.type === 'reward' ? 'View balance' : 'View order' })
          break
        }
      } catch (err) {
        if (!active||scope!==tabScope()) return
        if (err.status === 401) {
          const previous = currentUser.current
          currentUser.current = null; seen.current.clear(); setUser(null); setToast(null); setError('')
          if (previous && /^\/(profile|orders|purchase|seller|admin|messages)(\/|$)/.test(location.pathname) && location.pathname !== '/seller/login') navigate('/login', { replace: true, state: { sessionNotice: 'Your session ended. Please log in again.' } })
        }
        else setError(`Notification updates unavailable: ${err.message}`)
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const changed=()=>{currentUser.current=null;seen.current.clear();setUser(null);setToast(null);setError('');refresh()}
    window.addEventListener('account-session-changed',changed)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh);document.removeEventListener('visibilitychange', refresh);window.removeEventListener('account-session-changed',changed) }
  }, [location.pathname, navigate])

  useEffect(() => {
    const message = location.state?.orderToast
    if (message && routeToast.current !== message) {
      routeToast.current = message
      const timer = window.setTimeout(() => setToast({ title: 'Payment pending', body: message, link: '/orders' }), 0)
      return () => window.clearTimeout(timer)
    }
  }, [location.state])

  useEffect(() => {
    if (!toast || toast.orderPreview) return
    const timer = window.setTimeout(() => setToast(null), 8000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const showBell = user && (user.role === 'customer' || location.pathname.startsWith('/purchase/') || location.pathname === '/orders')
  if (!showBell && !toast && !error) return null
  return <div data-preserve-theme className="fixed right-4 top-20 z-[70] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
    {showBell && <Link to="/messages?view=notifications" aria-label={`Notifications, ${unread} unread`} className="relative grid size-11 place-items-center rounded-full border border-[#e5e5e5] bg-white text-[#111111] shadow-md"><Bell size={20} />{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[#d84250] px-1.5 py-0.5 text-xs font-bold text-white">{unread > 99 ? '99+' : unread}</span>}</Link>}
    {toast?.orderPreview&&<SellerOrderPreview key={toast.orderPreview} orderNumber={toast.orderPreview} link={toast.link} onClose={()=>setToast(null)}/>}
    {toast && !toast.orderPreview && <div role="status" className="w-80 max-w-full rounded-xl border border-[#cccccc] bg-white p-4 text-[#111111] shadow-lg"><div className="flex items-start gap-3"><div className="flex-1">{toast.body ? <>
      <p className="font-semibold">{toast.title}</p>
      <p className="mt-1 text-sm">{toast.body}</p>
      <Link to={toast.link} onClick={() => setToast(null)} className="mt-2 inline-block text-sm underline">{toast.linkLabel || 'View order'}</Link>
    </> : <Link to={toast.link} onClick={() => setToast(null)} className="font-semibold hover:underline">{toast.title}</Link>}</div><button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={18} /></button></div></div>}
    {error && <p role="status" className="rounded border border-red-200 bg-white p-2 text-xs text-red-800">{error}</p>}
  </div>
}
