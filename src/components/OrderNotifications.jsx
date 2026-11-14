import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'

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

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const { user: account } = await apiRequest('/api/auth/me', { background: true })
        if (!active) return
        if (currentUser.current !== account.id) {
          currentUser.current = account.id
          seen.current.clear()
          setToast(null)
        }
        setUser(account)
        const data = await apiRequest('/api/notifications', { background: true })
        if (!active) return
        setUnread(data.unreadCount)
        setError('')
        const fresh = data.notifications.filter((item) => {
          if (item.isRead || seen.current.has(item.id)) return false
          if (item.type === 'reward') return true
          return item.type === 'purchase' && (item.link?.startsWith('/purchase/') || item.link === '/orders' || (account.role === 'seller' && item.link?.startsWith('/seller/orders')) || (account.role === 'admin' && item.link?.startsWith('/admin') && item.link.endsWith('#purchase-orders')))
        })
        if (fresh.length) {
          seen.current.add(fresh[0].id)
          setToast({ title: fresh[0].title, body: fresh[0].body, link: fresh[0].link, linkLabel: fresh[0].type === 'reward' ? 'View balance' : 'View order' })
        }
      } catch (err) {
        if (!active) return
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
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
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
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 8000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const showBell = user && (user.role === 'customer' || location.pathname.startsWith('/purchase/') || location.pathname === '/orders')
  if (!showBell && !toast && !error) return null
  return <div data-preserve-theme className="fixed right-4 top-20 z-[70] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
    {showBell && <Link to="/messages?view=notifications" aria-label={`Notifications, ${unread} unread`} className="relative grid size-11 place-items-center rounded-full border border-[#dce4da] bg-white text-[#315941] shadow-md"><Bell size={20} />{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-[#d84250] px-1.5 py-0.5 text-xs font-bold text-white">{unread > 99 ? '99+' : unread}</span>}</Link>}
    {toast && <div role="status" className="w-80 max-w-full rounded-xl border border-[#b8d2ba] bg-white p-4 text-[#19231b] shadow-lg"><div className="flex items-start gap-3"><div className="flex-1"><p className="font-semibold">{toast.title}</p><p className="mt-1 text-sm">{toast.body}</p><Link to={toast.link} onClick={() => setToast(null)} className="mt-2 inline-block text-sm underline">{toast.linkLabel || 'View order'}</Link></div><button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={18} /></button></div></div>}
    {error && <p role="status" className="rounded border border-red-200 bg-white p-2 text-xs text-red-800">{error}</p>}
  </div>
}
