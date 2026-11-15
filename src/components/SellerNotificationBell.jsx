import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { apiRequest } from '../lib/api.js'

export default function SellerNotificationBell({ preview = false }) {
  const [unread, setUnread] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (preview) return
    let active = true
    const refresh = async () => {
      try {
        const data = await apiRequest('/api/notifications/summary', { background: true })
        if (active) { setUnread(data.unreadCount); setError('') }
      } catch (err) {
        if (active) { setUnread(null); setError(`Notifications unavailable: ${err.message}`) }
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [preview])
  return <div className="relative">
    <Link to={preview ? '/seller/login' : '/messages?view=notifications'} aria-label={unread === null ? 'Notifications' : `Notifications, ${unread} unread`} title={error || (unread === null ? 'Notifications' : `${unread} unread notifications`)} className={`relative grid size-10 place-items-center rounded-full border bg-white ${unread>0?'border-red-300 text-red-600':unread===0?'border-green-300 text-green-600':'border-gray-200 text-black'}`}>
      <Bell size={18} />
      {unread > 0 ? <span aria-hidden="true" className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span> : unread === 0 && <span aria-hidden="true" className="absolute right-0 top-0 size-3 rounded-full border-2 border-white bg-green-600" />}
    </Link>
    {error && <span role="status" className="absolute right-0 top-full z-50 mt-1 w-56 rounded border border-red-200 bg-white p-2 text-xs text-red-800">{error}</span>}
  </div>
}
