import SiteName from '../components/SiteName.jsx'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiRequest } from '../lib/api.js'
import AdminBuyers from '../components/AdminBuyers.jsx'
import AdminAccountDirectory from '../components/AdminAccountDirectory.jsx'
import { useSiteSettings } from '../context/siteSettings.js'

const AdminPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { siteName, saveSiteName } = useSiteSettings()
  const [nameMessage, setNameMessage] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [admin, setAdmin] = useState(null)
  const [users, setUsers] = useState([])
  const [sellers, setSellers] = useState([])
  const [products, setProducts] = useState([])
  const [events, setEvents] = useState([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [updatesError, setUpdatesError] = useState('')
  const [followerDrafts, setFollowerDrafts] = useState({})
  const [message, setMessage] = useState('Loading your admin workspace…')
  const [isLoading, setIsLoading] = useState(true)
  const sellerCount = users.filter((user) => user.role === 'seller').length

  const updateSiteName = async (event) => {
    event.preventDefault()
    const name = new FormData(event.currentTarget).get('siteName')
    setSavingName(true)
    setNameMessage('')
    try {
      await saveSiteName(name)
      setNameMessage('Website name saved.')
    } catch (error) {
      setNameMessage(error.message)
    } finally {
      setSavingName(false)
    }
  }

  useEffect(() => {
    if (!isLoading && admin && location.hash === '#buyers') document.getElementById('buyers')?.scrollIntoView()
  }, [admin, isLoading, location.hash])

  useEffect(() => {
    let isCurrent = true

    apiRequest('/api/auth/me')
      .then(async ({ user }) => {
        if (user.role !== 'admin') {
          if (isCurrent) {
            setMessage('This page is only available to the admin account.')
            setIsLoading(false)
          }
          return
        }

        const [userData, sellerData, productData, eventData, notificationData] = await Promise.all([
          apiRequest('/api/admin/users'),
          apiRequest('/api/admin/sellers'),
          apiRequest('/api/admin/products'),
          apiRequest('/api/admin/events'),
          apiRequest('/api/notifications'),
        ])
        if (!isCurrent) return
        setAdmin(user)
        setUsers(userData.users)
        setSellers(sellerData.sellers)
        setProducts(productData.products)
        setEvents(eventData.events)
        setUnreadNotifications(notificationData.notifications.filter((item) => !item.isRead).length)
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
  }, [navigate])

  useEffect(() => {
    if (!admin) return
    let active = true
    const timer = window.setInterval(async () => {
      try {
        const { notifications } = await apiRequest('/api/notifications')
        if (active) {
          setUnreadNotifications(notifications.filter((item) => !item.isRead).length)
          setUpdatesError('')
        }
      } catch (error) {
        if (active) setUpdatesError(`Notification updates unavailable: ${error.message}`)
      }
    }, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [admin])

  const changeRole = async (userId, role) => {
    setMessage('')
    try {
      await apiRequest(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      setUsers((currentUsers) => currentUsers.map((user) => (
        user.id === userId ? { ...user, role } : user
      )))
    } catch (error) {
      setMessage(error.message)
    }
  }

  const removeStore = async (seller) => {
    const storeName = seller.storeName || 'this partner store'
    if (!window.confirm(`Remove ${storeName} from the public storefront? Marketplace listings will remain available.`)) return
    try {
      await apiRequest(`/api/admin/sellers/${seller.id}/store`, { method: 'DELETE' })
      setSellers((currentSellers) => currentSellers.filter((item) => item.id !== seller.id))
      setMessage(`${storeName} was removed. The seller account remains active.`)
    } catch (error) {
      setMessage(error.message)
    }
  }

  const saveFollowerCount = async (seller) => {
    try {
      const { followerCount, adminFollowerCount } = await apiRequest(`/api/admin/sellers/${seller.id}/stats`, {
        method: 'PATCH',
        body: JSON.stringify({ followerCount: Number(followerDrafts[seller.id] ?? seller.adminFollowerCount ?? 0) }),
      })
      setSellers((currentSellers) => currentSellers.map((item) => item.id === seller.id
        ? { ...item, followerCount, adminFollowerCount }
        : item))
      setMessage(`Follower total updated for ${seller.storeName || seller.fullName}.`)
    } catch (error) {
      setMessage(error.message)
    }
  }

  const logOut = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {})
    navigate('/', { replace: true })
  }

  if (isLoading) {
    return <main className="mx-auto max-w-5xl px-5 py-16 text-sm text-[#666]">{message}</main>
  }

  if (!admin) {
    return (
      <main className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-3xl font-semibold">Admin access required</h1>
        <p className="mt-3 text-sm text-[#666]">{message || 'Sign in with the configured store owner account.'}</p>
        <Link to="/login" className="mt-6 inline-block bg-black px-5 py-3 text-sm font-medium text-white">Go to login</Link>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-[#07120b] text-[#edf3e9]">
      <header className="border-b border-[#26382b] bg-[#0b1710]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 md:px-10">
          <div>
            <Link to="/" className="text-2xl font-black tracking-[-0.07em]"><SiteName /><span className="ml-1 text-sm text-[#c8f135]">▰</span></Link>
            <p className="mt-1 text-xs text-[#9baa9d]">Store administration</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-[#b8c2b9] sm:inline">{admin.fullName} · #{admin.id}</span>
            <Link to="/admin/seller-metrics" className="text-[#c8f135] underline underline-offset-4">Seller metrics</Link>
            <Link to="/messages?view=notifications" className="text-[#c8f135] underline underline-offset-4">Notifications{unreadNotifications > 0 ? ` (${unreadNotifications} unread)` : ''}</Link>
            <Link to="/messages" className="text-[#c8f135] underline underline-offset-4">Message center</Link>
            <Link to="/seller" className="text-[#c8f135] underline underline-offset-4">Seller tools</Link>
            <button type="button" onClick={logOut} className="border border-[#3b5140] px-4 py-2 text-[#e9f0e5] hover:border-[#c8f135]">Log out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-9 md:px-10 md:py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#c8f135]">Owner workspace</p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Admin dashboard</h1>
          </div>
          <div className="flex gap-3 text-xs">
            <span className="border border-[#263c2d] bg-[#0d1b12] px-4 py-3 text-[#c8f135]">{users.length} users</span>
            <span className="border border-[#263c2d] bg-[#0d1b12] px-4 py-3 text-[#c8f135]">{sellerCount} sellers</span>
            <span className="border border-[#263c2d] bg-[#0d1b12] px-4 py-3 text-[#c8f135]">{products.length} products</span>
          </div>
        </div>

        {message && <p role="status" className="mb-5 border border-[#76513f] bg-[#1a1b12] px-4 py-3 text-sm text-[#f3c7ac]">{message}</p>}
        {updatesError && <p role="alert" className="mb-5 border border-[#76513f] bg-[#1a1b12] px-4 py-3 text-sm text-[#f3c7ac]">{updatesError}</p>}

        <section className="mb-8 rounded-xl border border-[#263c2d] bg-[#0d1b12] p-5 sm:p-7">
          <h2 className="text-lg font-semibold">Website name</h2>
          <p className="mt-1 text-sm text-[#9baa9d]">Change the name shown across your storefront and account emails.</p>
          <form onSubmit={updateSiteName} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 text-sm">Name
              <input key={siteName} name="siteName" defaultValue={siteName} required maxLength={80} className="mt-2 block w-full rounded border border-[#3b5140] bg-[#07120b] px-3 py-2 text-white" />
            </label>
            <button disabled={savingName} className="rounded bg-[#c8f135] px-5 py-2.5 text-sm font-semibold text-[#102016] disabled:opacity-60">{savingName ? 'Saving…' : 'Save name'}</button>
          </form>
          {nameMessage && <p role="status" className="mt-3 text-sm text-[#dce9d5]">{nameMessage}</p>}
        </section>

        <AdminAccountDirectory users={users} sellers={sellers} />

        <details open={location.hash === '#buyers' ? true : undefined} className="mb-8 rounded-xl border border-[#263c2d] bg-[#0d1b12]">
          <summary className="cursor-pointer px-5 py-4 font-semibold">Additional administration tools</summary>
        <AdminBuyers />

        <section className="mb-8 border border-[#263c2d] bg-[#0d1b12]">
          <div className="flex items-end justify-between border-b border-[#263c2d] px-5 py-4 sm:px-7">
            <div><h2 className="text-lg font-semibold">User accounts</h2><p className="mt-1 text-xs text-[#9baa9d]">IDs and contact details are visible. Passwords are never stored in readable form.</p></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm text-[#e5ece2]">
              <thead className="bg-[#122219] text-[10px] uppercase tracking-[0.12em] text-[#c8f135]">
                <tr><th className="px-5 py-3 sm:px-7">Member ID</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3 sm:px-7">Account type</th></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-[#263c2d]">
                    <td className="px-5 py-4 font-mono text-xs sm:px-7">#{user.id}</td>
                    <td className="px-5 py-4"><Link className="underline" to={`/admin/users/${user.id}`}>{user.fullName}</Link></td>
                    <td className="px-5 py-4">{user.email}</td>
                    <td className="px-5 py-4">{user.phone || '—'}</td>
                    <td className="px-5 py-4 sm:px-7">
                      {user.role === 'admin' ? <span className="text-xs font-semibold uppercase">Admin</span> : (
                        <select value={user.role} onChange={(event) => changeRole(user.id, event.target.value)} aria-label={`Role for ${user.email}`} className="border border-[#3b5140] bg-[#101c13] px-2 py-2 text-xs text-[#e5ece2]">
                          <option value="customer">Customer</option><option value="seller">Seller</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
                {!users.length && <tr><td colSpan="5" className="px-7 py-10 text-center text-sm text-[#9baa9d]">No accounts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-8 border border-[#263c2d] bg-[#0d1b12]">
          <div className="border-b border-[#263c2d] px-5 py-4 sm:px-7">
            <h2 className="text-lg font-semibold">Seller profiles</h2>
            <p className="mt-1 text-xs text-[#9baa9d]">Profile details are recorded. Identity files and SSNs are not collected or stored.</p>
            <Link to="/admin/seller-metrics" className="mt-2 inline-block text-xs text-[#c8f135] underline underline-offset-4">Edit seller dashboard numbers</Link>
          </div>
          <div className="divide-y divide-[#263c2d]">
            {sellers.map((seller) => (
              <article key={seller.id} className="grid gap-3 px-5 py-5 text-sm md:grid-cols-[1fr_1fr_1.2fr_auto] sm:px-7">
                <div className="flex items-start gap-3">{seller.storeLogoUrl && <img src={seller.storeLogoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />}<div><h3 className="font-semibold"><Link to={`/admin/users/${seller.id}`} className="underline">{seller.storeName || 'Seller workspace'}</Link> <span className="font-mono text-xs font-normal text-[#9baa9d]">#{seller.id}</span></h3><p className="mt-1 text-xs text-[#b8c2b9]">{seller.fullName} · {seller.email}</p><p className="mt-1 text-xs text-[#b8c2b9]">{seller.phone || 'No phone provided'}</p></div></div>
                <div><p>{seller.country || 'Country not provided'}</p><p className="mt-1 text-xs text-[#b8c2b9]">{[seller.address, seller.city, seller.region, seller.postalCode].filter(Boolean).join(', ') || 'Address not provided'}</p></div>
                <div>
                  <p className="text-xs leading-5 text-[#c9d2c8]">{seller.storeDescription || 'No store description provided.'}</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#c8f135]">{seller.verificationStatus?.replaceAll('_', ' ') || 'Profile not completed'}</p>
                  {seller.storeName && <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="block text-xs">Admin follower adjustment
                      <input type="number" min="0" max="1000000000" step="1" value={followerDrafts[seller.id] ?? seller.adminFollowerCount ?? 0} onChange={(event) => setFollowerDrafts((current) => ({ ...current, [seller.id]: event.target.value }))} className="mt-1 h-9 w-28 border border-[#3b5140] bg-[#101c13] px-2 text-sm text-white" />
                    </label>
                    <button type="button" onClick={() => saveFollowerCount(seller)} className="h-9 border border-[#3b5140] px-3 text-xs hover:border-[#c8f135]">Save count</button>
                  </div>}
                  {seller.storeName && <p className="mt-2 text-[10px] text-[#9baa9d]">Total: {seller.followerCount || 0} followers · {seller.visitorCount || 0} visits. Real signed-in follows are counted separately.</p>}
                </div>
                {seller.storeName && <button type="button" onClick={() => removeStore(seller)} className="self-center border border-[#76513f] px-3 py-2 text-xs text-[#f3c7ac] hover:border-[#f3c7ac]">Remove store</button>}
              </article>
            ))}
            {!sellers.length && <p className="px-7 py-8 text-sm text-[#9baa9d]">No seller profiles yet.</p>}
          </div>
        </section>

        <section className="mb-8 border border-[#263c2d] bg-[#0d1b12]">
          <div className="border-b border-[#263c2d] px-5 py-4 sm:px-7">
            <h2 className="text-lg font-semibold">Recent account activity</h2>
            <p className="mt-1 text-xs text-[#9baa9d]">Latest registrations and successful sign-ins.</p>
          </div>
          <div className="divide-y divide-[#263c2d]">
            {events.map((event) => (
              <article key={event.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 text-sm sm:px-7">
                <span className="min-w-24 text-xs font-semibold uppercase tracking-wide text-[#c8f135]">{event.type === 'registered' ? 'Registered' : 'Signed in'}</span>
                <span className="min-w-32 flex-1">{event.fullName} <span className="text-xs text-[#9baa9d]">#{event.userId}</span></span>
                <span className="text-xs text-[#b8c2b9]">{event.email}</span>
                <time className="text-xs text-[#9baa9d]" dateTime={`${event.createdAt.replace(' ', 'T')}Z`}>{new Date(`${event.createdAt.replace(' ', 'T')}Z`).toLocaleString()}</time>
              </article>
            ))}
            {!events.length && <p className="px-7 py-8 text-sm text-[#9baa9d]">No account activity yet.</p>}
          </div>
        </section>

        <section className="border border-[#263c2d] bg-[#0d1b12]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#263c2d] px-5 py-4 sm:px-7">
            <div><h2 className="text-lg font-semibold">Product catalog</h2><p className="mt-1 text-xs text-[#9baa9d]">Products added by you or sellers appear in the storefront.</p></div>
            <Link to="/seller" className="bg-[#c8f135] px-4 py-2.5 text-xs font-semibold text-[#112016]">Manage products</Link>
          </div>
          <div className="divide-y divide-[#263c2d]">
            {products.map((product) => (
              <article key={product.id} className="flex items-center gap-4 px-5 py-4 sm:px-7">
                <img src={product.imageUrl} alt="" className="size-14 shrink-0 bg-[#132217] object-cover" />
                <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium">{product.name}</h3><p className="mt-1 text-xs text-[#9baa9d]">{product.category} · ID #{product.id}</p></div>
                <span className="text-right text-sm">
                  {product.compareAtPrice && <span className="mr-2 text-xs text-[#9baa9d] line-through">${product.compareAtPrice.toFixed(2)}</span>}
                  <span className={product.compareAtPrice ? 'font-semibold text-[#c8f135]' : ''}>${product.price.toFixed(2)}</span>
                </span>
                <span className={`hidden text-[10px] font-semibold uppercase sm:inline ${product.isPublished ? 'text-[#c8f135]' : 'text-[#d5a77e]'}`}>{product.isPublished ? 'Published' : 'Draft'}</span>
              </article>
            ))}
          </div>
        </section>
        </details>
      </main>
    </div>
  )
}

export default AdminPage
