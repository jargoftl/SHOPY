import AdminSellerFinance from '../components/AdminSellerFinance.jsx'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiRequest } from '../lib/api.js'
import AdminPurchases from '../components/AdminPurchases.jsx'
import AdminSellerApplications from '../components/AdminSellerApplications.jsx'
import AdminMarketing from '../components/AdminMarketing.jsx'
import AdminWarehouse from '../components/AdminWarehouse.jsx'
import { useSiteSettings } from '../context/siteSettings.js'

const AdminPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { siteName, saveSiteName } = useSiteSettings()
  const [admin, setAdmin] = useState(null)
  const [users, setUsers] = useState([])
  const [sellers, setSellers] = useState([])
  const [products, setProducts] = useState([])
  const [events, setEvents] = useState([])
  const [message, setMessage] = useState('Loading your admin workspace…')
  const [isLoading, setIsLoading] = useState(true)
  const [siteNameMessage, setSiteNameMessage] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)
  const sellerCount = users.filter((user) => user.role === 'seller').length
  const selectedOrder = searchParams.get('order')

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

        const [userData, sellerData, productData, eventData] = await Promise.all([
          apiRequest('/api/admin/users'),
          apiRequest('/api/admin/sellers'),
          apiRequest('/api/admin/products'),
          apiRequest('/api/admin/events'),
        ])
        if (!isCurrent) return
        setAdmin(user)
        setUsers(userData.users)
        setSellers(sellerData.sellers)
        setProducts(productData.products)
        setEvents(eventData.events)
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

  const updateSiteName = async (event) => {
    event.preventDefault()
    const name = new FormData(event.currentTarget).get('siteName').trim()
    if (!name) {
      setSiteNameMessage('Enter a website name.')
      return
    }
    setIsSavingName(true)
    setSiteNameMessage('')
    try {
      await saveSiteName(name)
      setSiteNameMessage('Website name saved.')
    } catch (error) {
      setSiteNameMessage(error.message)
    } finally {
      setIsSavingName(false)
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
            <Link to="/" className="text-2xl font-black tracking-[-0.07em]">{siteName}<span className="ml-1 text-sm text-[#c8f135]">▰</span></Link>
            <p className="mt-1 text-xs text-[#9baa9d]">Store administration</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-[#b8c2b9] sm:inline">{admin.fullName} · #{admin.publicId || '—'}</span>
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

        <section className="mb-8 border border-[#263c2d] bg-[#0d1b12]">
          <details>
            <summary className="cursor-pointer px-5 py-4 text-lg font-semibold sm:px-7">Website settings</summary>
            <form key={siteName} onSubmit={updateSiteName} className="flex flex-wrap items-end gap-3 border-t border-[#263c2d] px-5 py-5 sm:px-7">
              <label className="block w-full max-w-sm text-xs text-[#b8c2b9]">Website name
                <input name="siteName" defaultValue={siteName} maxLength={80} required className="mt-2 block h-11 w-full border border-[#3b5140] bg-[#101c13] px-3 text-sm text-white" />
              </label>
              <button type="submit" disabled={isSavingName} className="min-h-11 bg-[#c8f135] px-5 text-sm font-semibold text-[#112016] disabled:opacity-60">{isSavingName ? 'Saving…' : 'Save name'}</button>
              {siteNameMessage && <p role="status" className="w-full text-sm text-[#b8c2b9]">{siteNameMessage}</p>}
            </form>
          </details>
        </section>

        <AdminSellerApplications />
        <AdminMarketing />
        <AdminWarehouse />
        <AdminSellerFinance />
      <AdminPurchases selectedNumber={selectedOrder} />

        <section className="mb-8 border border-[#263c2d] bg-[#0d1b12]">
          <details open>
            <summary className="flex cursor-pointer items-center justify-between border-b border-[#263c2d] px-5 py-4 sm:px-7"><span><span className="block text-lg font-semibold">User accounts · {users.length}</span><span className="mt-1 block text-xs text-[#9baa9d]">IDs and contact details; passwords are never displayed.</span></span></summary>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm text-[#e5ece2]">
              <thead className="bg-[#122219] text-[10px] uppercase tracking-[0.12em] text-[#c8f135]">
                <tr><th className="px-5 py-3 sm:px-7">Member ID</th><th className="px-5 py-3">Name</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3 sm:px-7">Account type</th></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-[#263c2d]">
                    <td className="px-5 py-4 font-mono text-xs sm:px-7">#{user.publicId || '—'}</td>
                    <td className="px-5 py-4"><Link to={`/admin/users/${user.id}`} className="flex items-center gap-2 underline-offset-2 hover:underline"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#1e3426] text-[10px] font-semibold text-[#c8f135]">{user.fullName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>{user.fullName}</Link></td>
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
          </details>
        </section>

        <section className="mb-8 border border-[#263c2d] bg-[#0d1b12]">
          <details>
            <summary className="cursor-pointer border-b border-[#263c2d] px-5 py-4 sm:px-7"><span className="block text-lg font-semibold">Seller profiles · {sellers.length}</span><span className="mt-1 block text-xs text-[#9baa9d]">Profile details only; no SSNs or identity files are collected.</span></summary>
          <div className="divide-y divide-[#263c2d]">
            {sellers.map((seller) => (
              <article key={seller.id} className="grid gap-3 px-5 py-5 text-sm md:grid-cols-[1fr_1fr_1.2fr] sm:px-7">
                <div><Link to={`/admin/users/${seller.id}`} className="flex items-center gap-2 font-semibold underline-offset-2 hover:underline">{seller.storeLogoUrl ? <img src={seller.storeLogoUrl} alt="" className="size-9 shrink-0 rounded-full object-cover" /> : <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#1e3426] text-xs font-semibold text-[#c8f135]">{(seller.storeName || seller.fullName).slice(0, 1).toUpperCase()}</span>}<span>{seller.storeName || 'Seller workspace'} <span className="font-mono text-xs font-normal text-[#9baa9d]">#{seller.publicId || '—'}</span></span></Link><p className="mt-1 text-xs text-[#b8c2b9]">{seller.fullName} · {seller.email}</p><p className="mt-1 text-xs text-[#b8c2b9]">{seller.phone || 'No phone provided'}</p></div>
                <div><p>{seller.country || 'Country not provided'}</p><p className="mt-1 text-xs text-[#b8c2b9]">{[seller.address, seller.city, seller.region, seller.postalCode].filter(Boolean).join(', ') || 'Address not provided'}</p></div>
                <div><p className="text-xs leading-5 text-[#c9d2c8]">{seller.storeDescription || 'No store description provided.'}</p><p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[#c8f135]">{seller.verificationStatus === 'demo_documents_not_stored' ? 'Identity files not stored' : seller.verificationStatus?.replaceAll('_', ' ') || 'Profile not completed'}</p></div>
              </article>
            ))}
            {!sellers.length && <p className="px-7 py-8 text-sm text-[#9baa9d]">No seller profiles yet.</p>}
          </div>
          </details>
        </section>

        <section className="mb-8 border border-[#263c2d] bg-[#0d1b12]">
          <details>
            <summary className="cursor-pointer border-b border-[#263c2d] px-5 py-4 sm:px-7"><span className="block text-lg font-semibold">Recent account activity · {events.length}</span><span className="mt-1 block text-xs text-[#9baa9d]">Latest registrations and successful sign-ins.</span></summary>
          <div className="divide-y divide-[#263c2d]">
            {events.map((event) => (
              <article key={event.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 text-sm sm:px-7">
                <span className="min-w-24 text-xs font-semibold uppercase tracking-wide text-[#c8f135]">{event.type === 'registered' ? 'Registered' : 'Signed in'}</span>
                <span className="min-w-32 flex-1">{event.fullName} <span className="text-xs text-[#9baa9d]">#{event.publicId || '—'}</span></span>
                <span className="text-xs text-[#b8c2b9]">{event.email}</span>
                <time className="text-xs text-[#9baa9d]" dateTime={`${event.createdAt.replace(' ', 'T')}Z`}>{new Date(`${event.createdAt.replace(' ', 'T')}Z`).toLocaleString()}</time>
              </article>
            ))}
            {!events.length && <p className="px-7 py-8 text-sm text-[#9baa9d]">No account activity yet.</p>}
          </div>
          </details>
        </section>

        <section className="border border-[#263c2d] bg-[#0d1b12]">
          <details>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 border-b border-[#263c2d] px-5 py-4 sm:px-7"><span><span className="block text-lg font-semibold">Product catalog · {products.length}</span><span className="mt-1 block text-xs text-[#9baa9d]">Products added by you or sellers.</span></span><Link to="/seller/products" onClick={(event) => event.stopPropagation()} className="bg-[#c8f135] px-4 py-2.5 text-xs font-semibold text-[#112016]">Manage products</Link></summary>
          <div className="divide-y divide-[#263c2d]">
            {products.map((product) => (
              <article key={product.id} className="flex items-center gap-4 px-5 py-4 sm:px-7">
                <img src={product.imageUrl} alt="" className="size-14 shrink-0 bg-[#132217] object-cover" />
                <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium">{product.name}</h3><p className="mt-1 text-xs text-[#9baa9d]">{product.category} · ID #{product.publicId || '—'}</p></div>
                <span className="text-right text-sm">
                  {product.compareAtPrice && <span className="mr-2 text-xs text-[#9baa9d] line-through">${product.compareAtPrice.toFixed(2)}</span>}
                  <span className={product.compareAtPrice ? 'font-semibold text-[#c8f135]' : ''}>${product.price.toFixed(2)}</span>
                </span>
                <span className={`hidden text-[10px] font-semibold uppercase sm:inline ${product.isPublished ? 'text-[#c8f135]' : 'text-[#d5a77e]'}`}>{product.isPublished ? 'Published' : 'Draft'}</span>
              </article>
            ))}
          </div>
          </details>
        </section>
      </main>
    </div>
  )
}

export default AdminPage
