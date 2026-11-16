import ContentPlaceholder from '../components/ContentPlaceholder.jsx'
import SiteName from '../components/SiteName.jsx'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, MessageCircle, RefreshCw, Send } from 'lucide-react'
import { apiRequest } from '../lib/api.js'

const MessageCenterPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [conversations, setConversations] = useState([])
  const [selectedSellerId, setSelectedSellerId] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [activeTab, setActiveTab] = useState(location.search.includes('view=notifications') ? 'notifications' : 'messages')
  const [refreshKey, setRefreshKey] = useState(0)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    let isCurrent = true
    apiRequest('/api/auth/me')
      .then(async ({ user: account }) => {
        if (!['seller', 'customer', 'admin'].includes(account.role)) {
          navigate('/', { replace: true })
          return
        }
        const [notificationData, inboxData] = await Promise.all([
          apiRequest('/api/notifications'),
          apiRequest('/api/messages'),
        ])
        if (!isCurrent) return
        setUser(account)
        setNotifications(notificationData.notifications)
        if (account.role === 'admin') {
          setConversations(inboxData.conversations)
          const requestedId = Number(new URLSearchParams(location.search).get('user'))
          setSelectedSellerId((current) => current || inboxData.conversations.find((item) => item.sellerId === requestedId)?.sellerId || inboxData.conversations[0]?.sellerId || null)
        } else {
          setMessages(inboxData.messages)
        }
        setMessage('')
        setIsLoading(false)
      })
      .catch((error) => {
        if (!isCurrent) return
        if (error.message.includes('log in') || error.message.includes('session')) {
          navigate('/login', { replace: true })
          return
        }
        setMessage(error.message)
        setIsLoading(false)
      })
    return () => { isCurrent = false }
  }, [navigate, refreshKey, location.search])

  useEffect(() => {
    if (user?.role !== 'admin' || !selectedSellerId) return
    let isCurrent = true
    apiRequest(`/api/messages/${selectedSellerId}`)
      .then(({ messages: threadMessages }) => {
        if (isCurrent) setMessages(threadMessages)
      })
      .catch((error) => {
        if (isCurrent) setMessage(error.message)
      })
    return () => { isCurrent = false }
  }, [user?.role, selectedSellerId, refreshKey])

  const selectedConversation = conversations.find((conversation) => conversation.sellerId === selectedSellerId)
  const unreadNotifications = notifications.filter((notification) => !notification.isRead).length

  const markNotificationRead = async (notificationId) => {
    try {
      await apiRequest(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
      setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, isRead: true } : item))
      return true
    } catch (error) {
      setMessage(error.message)
      return false
    }
  }

  const markAllRead = async () => {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'PATCH' })
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })))
    } catch (error) {
      setMessage(error.message)
    }
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    if (!draft.trim()) return
    setIsSending(true)
    setMessage('')
    try {
      await apiRequest('/api/messages', {
        method: 'POST',
        body: JSON.stringify({ body: draft, ...(user.role === 'admin' ? { sellerId: selectedSellerId } : {}) }),
      })
      setDraft('')
      setRefreshKey((current) => current + 1)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSending(false)
    }
  }

  const logOut = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {})
    navigate('/', { replace: true })
  }

  if (isLoading) return <main className="mx-auto max-w-5xl px-5 py-16 text-sm text-[#666]"><ContentPlaceholder/></main>

  const isAdmin = user?.role === 'admin'
  const unreadMessages = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0)

  return (
    <div className={`min-h-screen ${isAdmin ? 'bg-[#111111] text-[#f7f7f7]' : 'bg-[#f7f7f5] text-[#111111]'}`}>
      <header className={`border-b ${isAdmin ? 'border-[#111111] bg-[#111111]' : 'border-[#e5e5e5] bg-white'}`}>
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-5 md:px-10">
          <div>
            <Link to="/" className={`text-2xl font-black tracking-[-0.07em] ${isAdmin ? 'text-white' : 'text-[#111111]'}`}><SiteName /><span className="ml-1 text-sm">▰</span></Link>
            <p className={`mt-1 text-xs ${isAdmin ? 'text-[#777777]' : 'text-[#555555]'}`}>{isAdmin ? 'Store administration' : user?.role === 'customer' ? 'Buyer account' : 'Seller workspace'}</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {isAdmin ? <Link to="/admin" className="hidden underline underline-offset-4 sm:inline">Admin dashboard</Link> : <Link to={user?.role === 'customer' ? '/profile' : '/seller'} className="hidden underline underline-offset-4 sm:inline">{user?.role === 'customer' ? 'Buyer profile' : 'Seller workspace'}</Link>}
            <button type="button" onClick={logOut} className={`border px-3 py-2 text-xs ${isAdmin ? 'border-[#111111] hover:border-[#cccccc]' : 'border-[#cccccc] hover:border-black'}`}>Log out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-8 md:px-10 md:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${isAdmin ? 'text-[#cccccc]' : 'text-[#111111]'}`}>Account support</p>
            <h1 className="mt-2 text-3xl font-semibold">Messages & notifications</h1>
          </div>
          <button type="button" onClick={() => setRefreshKey((current) => current + 1)} aria-label="Refresh inbox" title="Refresh inbox" className={`grid size-10 place-items-center border ${isAdmin ? 'border-[#111111] hover:border-[#cccccc]' : 'border-[#cccccc] hover:border-black'}`}><RefreshCw size={17} /></button>
        </div>

        {message && <p role="status" className={`mb-5 border px-4 py-3 text-sm ${isAdmin ? 'border-[#111111] bg-[#111111] text-[#cccccc]' : 'border-[#e5e5e5] bg-white text-[#8a3c2d]'}`}>{message}</p>}

        <div className={`mb-5 flex border-b ${isAdmin ? 'border-[#111111]' : 'border-[#e5e5e5]'}`} role="tablist" aria-label="Message center sections">
          <button type="button" role="tab" aria-selected={activeTab === 'messages'} onClick={() => setActiveTab('messages')} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === 'messages' ? (isAdmin ? 'border-[#cccccc] text-[#cccccc]' : 'border-[#111111] text-[#111111]') : 'border-transparent opacity-70'}`}>
            <MessageCircle size={16} /> Messages {isAdmin && unreadMessages > 0 && <span className="text-xs">{unreadMessages}</span>}
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${activeTab === 'notifications' ? (isAdmin ? 'border-[#cccccc] text-[#cccccc]' : 'border-[#111111] text-[#111111]') : 'border-transparent opacity-70'}`}>
            <Bell size={16} /> Notifications {unreadNotifications > 0 && <span className="text-xs">{unreadNotifications}</span>}
          </button>
        </div>

        {activeTab === 'notifications' ? (
          <section className={`border ${isAdmin ? 'border-[#111111] bg-[#111111]' : 'border-[#e5e5e5] bg-white'}`}>
            <div className={`flex items-center justify-between gap-3 border-b px-5 py-4 ${isAdmin ? 'border-[#111111]' : 'border-[#e5e5e5]'}`}>
              <div><h2 className="font-semibold">Your notifications</h2><p className={`mt-1 text-xs ${isAdmin ? 'text-[#777777]' : 'text-[#555555]'}`}>{unreadNotifications} unread</p></div>
              {unreadNotifications > 0 && <button type="button" onClick={markAllRead} className="text-xs underline underline-offset-4">Mark all read</button>}
            </div>
            <div className={`divide-y ${isAdmin ? 'divide-[#111111]' : 'divide-[#eee]'}`}>
              {notifications.map((notification) => (
                <article key={notification.id} className={`flex items-start gap-3 px-5 py-4 ${isAdmin && notification.isRead ? 'bg-white text-[#111111]' : isAdmin ? 'bg-[#111111]' : ''}`}>
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${notification.isRead?'bg-green-600':'bg-red-600'}`} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold">{notification.title}<span className={`ml-2 rounded px-2 py-0.5 text-[10px] ${notification.isRead?'bg-green-50 text-green-700':'bg-red-50 text-red-700'}`}>{notification.isRead?'Read':'Unread'}</span>{user?.role === 'seller' && <span className="sr-only"> · {notification.isRead ? 'Read' : 'Unread'}</span>}</h3>
                    <p className={`mt-1 text-sm ${isAdmin && !notification.isRead ? 'text-[#cccccc]' : 'text-[#666]'}`}>{notification.body}</p>
                    {notification.link && <Link to={notification.link} onClick={async (event) => { if (!notification.isRead) { event.preventDefault(); if (await markNotificationRead(notification.id)) navigate(notification.link) } }} className="mt-2 inline-block text-xs underline underline-offset-4">View details</Link>}
                    <time className={`mt-2 block text-[10px] ${isAdmin && !notification.isRead ? 'text-[#777777]' : 'text-[#777]'}`}>{new Date(`${notification.createdAt.replace(' ', 'T')}Z`).toLocaleString()}</time>
                  </div>
                  {!notification.isRead && <button type="button" onClick={() => markNotificationRead(notification.id)} className="shrink-0 text-xs underline underline-offset-4">Mark read</button>}
                </article>
              ))}
              {!notifications.length && <p className={`px-5 py-12 text-center text-sm ${isAdmin ? 'text-[#777777]' : 'text-[#555555]'}`}>No notifications yet.</p>}
            </div>
          </section>
        ) : (
          <div className={`grid min-h-[520px] border ${isAdmin ? 'border-[#111111] bg-[#111111]' : 'border-[#e5e5e5] bg-white'} ${isAdmin ? 'md:grid-cols-[300px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
            {isAdmin && (
              <aside className={`border-b md:border-b-0 md:border-r ${isAdmin ? 'border-[#111111]' : 'border-[#e5e5e5]'}`}>
                <div className={`border-b px-4 py-4 ${isAdmin ? 'border-[#111111]' : 'border-[#e5e5e5]'}`}><h2 className="text-sm font-semibold">Buyer and seller conversations</h2><p className="mt-1 text-xs text-[#777777]">{conversations.length} accounts</p></div>
                <div className="max-h-[520px] overflow-y-auto">
                  {conversations.map((conversation) => (
                    <button key={conversation.sellerId} type="button" onClick={() => setSelectedSellerId(conversation.sellerId)} className={`w-full border-b px-4 py-4 text-left ${selectedSellerId === conversation.sellerId ? 'bg-[#111111]' : 'border-[#111111] hover:bg-[#111111]'}`}>
                      <div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold">{conversation.storeName || conversation.sellerName}</span>{conversation.unreadCount > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#cccccc] text-[10px] font-bold text-[#111111]">{conversation.unreadCount}</span>}</div>
                      <p className="mt-1 truncate text-xs text-[#777777]">{conversation.lastMessage || conversation.email}</p>
                    </button>
                  ))}
                  {!conversations.length && <p className="px-4 py-8 text-sm text-[#777777]">No buyer or seller accounts yet.</p>}
                </div>
              </aside>
            )}

            <section className="flex min-h-[520px] min-w-0 flex-col">
              <div className={`border-b px-5 py-4 ${isAdmin ? 'border-[#111111]' : 'border-[#e5e5e5]'}`}>
                <h2 className="text-sm font-semibold">{isAdmin ? selectedConversation?.storeName || selectedConversation?.sellerName || 'Choose an account' : <>Message the <SiteName /> admin</>}</h2>
                <p className={`mt-1 text-xs ${isAdmin ? 'text-[#777777]' : 'text-[#555555]'}`}>{isAdmin ? selectedConversation?.email || 'Select a conversation to reply.' : 'Send a message about your store or account.'}</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
                {messages.map((item) => (
                  <article key={item.id} className={`max-w-[85%] border px-4 py-3 ${item.isMine ? `ml-auto ${isAdmin ? 'border-[#111111] bg-[#111111]' : 'border-[#cccccc] bg-[#f7f7f7]'}` : isAdmin ? 'border-[#111111] bg-[#111111]' : 'border-[#e5e5e5] bg-[#fafaf8]'}`}>
                    <p className={`mb-1 text-[10px] font-semibold ${isAdmin ? 'text-[#cccccc]' : 'text-[#111111]'}`}>{item.isMine ? 'You' : item.senderName}</p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
                    <time className={`mt-2 block text-right text-[10px] ${isAdmin ? 'text-[#777777]' : 'text-[#888]'}`}>{new Date(`${item.createdAt.replace(' ', 'T')}${item.createdAt.includes('Z') ? '' : 'Z'}`).toLocaleString()}</time>
                  </article>
                ))}
                {!messages.length && <p className={`py-16 text-center text-sm ${isAdmin ? 'text-[#777777]' : 'text-[#555555]'}`}>No messages in this conversation yet.</p>}
              </div>
              <form onSubmit={sendMessage} className={`flex items-end gap-3 border-t p-4 ${isAdmin ? 'border-[#111111]' : 'border-[#e5e5e5]'}`}>
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2} placeholder={isAdmin ? 'Write a reply…' : 'Write a message to the admin…'} disabled={isAdmin && !selectedSellerId} className={`min-h-12 flex-1 resize-y border bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-50 ${isAdmin ? 'border-[#111111] focus:border-[#cccccc]' : 'border-[#cccccc] focus:border-black'}`} />
                <button type="submit" disabled={isSending || !draft.trim() || (isAdmin && !selectedSellerId)} aria-label="Send message" title="Send message" className={`grid size-11 shrink-0 place-items-center disabled:opacity-50 ${isAdmin ? 'bg-[#cccccc] text-[#111111]' : 'bg-[#111111] text-white'}`}><Send size={17} /></button>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

export default MessageCenterPage
