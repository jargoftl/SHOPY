import UiverseSelect from '../components/UiverseSelect.jsx'
import AdminSellerFunding from '../components/AdminSellerFunding.jsx'
import AdminHistoricalWalletEntry from '../components/AdminHistoricalWalletEntry.jsx'
import { SaleEntry } from '../components/AdminSellerHistoricalSales.jsx'
import AdminSellerMetricsPage from './AdminSellerMetricsPage.jsx'
import DeleteAccount from '../components/DeleteAccount.jsx'
import AdminStoreDates from '../components/AdminStoreDates.jsx'
import AdminRecovery from '../components/AdminRecovery.jsx'
import ContentPlaceholder from '../components/ContentPlaceholder.jsx'
import ReviewsPanel from '../components/ReviewsPanel.jsx'
import AdminSellerActuals from '../components/AdminSellerActuals.jsx'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiRequest } from '../lib/api.js'
import { formatMoney, parseAmountCents } from '../lib/money.js'
import SellerVerificationReview from '../components/SellerVerificationReview.jsx'
import AdminBuyers from '../components/AdminBuyers.jsx'
import AmountInput from '../components/AmountInput.jsx'
import { FolderOpen, Mail, MessageSquare, ShieldCheck, UserRound } from 'lucide-react'

const panel = 'rounded-xl border border-[#111111] bg-[#111111] p-5 sm:p-6'

const AdminUserDetailsPage = () => {
  const { userId } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rewardToast, setRewardToast] = useState('')
  const [amountKey, setAmountKey] = useState(0)
  useEffect(() => {
    let active = true
    apiRequest(`/api/admin/users/${userId}/details`).then((result) => { if (active) setData(result) }).catch((err) => { if (active) setError(err.message) })
    return () => { active = false }
  }, [userId])
  useEffect(() => {
    if (!rewardToast) return undefined
    const timer = window.setTimeout(() => setRewardToast(''), 8000)
    return () => window.clearTimeout(timer)
  }, [rewardToast])
  const updateReview = async (path, body) => {
    setBusy(true); setError('')
    try {
      await apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) })
      setData(await apiRequest(`/api/admin/users/${userId}/details`))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const refreshDetails = async () => setData(await apiRequest(`/api/admin/users/${userId}/details`))
  const adjustRewards = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    const amount = parseAmountCents(String(values.get('amount') || ''))
    if (!amount) { setError('Enter a valid balance amount greater than zero.'); return }
    const adjustmentUnits = values.get('operation') === 'reduce' ? -amount : amount
    setBusy(true); setError(''); setRewardToast('')
    try {
      const result = await apiRequest(`/api/admin/users/${userId}/rewards`, { method: 'PATCH', body: JSON.stringify({ adjustmentUnits }) })
      setData((current) => ({ ...current, rewards: { balanceUnits: result.balanceUnits } }))
      form.reset()
      setAmountKey((current) => current + 1)
      setRewardToast(adjustmentUnits > 0 ? 'Balance added' : 'Balance updated')
      try {
        setData(await apiRequest(`/api/admin/users/${userId}/details`))
      } catch {
        setError('Balance was updated, but account history could not be refreshed. Reload the page to see it.')
      }
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  if (!data) return <main className="mx-auto max-w-xl px-5 py-20">{error?<p role="alert">{error}</p>:<ContentPlaceholder/>}<Link to={error ? '/login' : '/admin'} className="mt-4 inline-block underline">{error ? 'Go to login' : 'Admin dashboard'}</Link></main>
  const { user, seller, visits, addresses, requests, events, balanceHistory, balanceResets, rewards, rewardHistory, balancePurchases, products, cancellationRequests, favorites, follows, accountHistory } = data
  const confirmedDeposits = requests.filter((request) => request.kind === 'deposit' && request.status === 'confirmed').reduce((sum, request) => sum + request.amountCents, 0)
  return <div className="admin-workspace min-h-screen bg-[#111111] text-[#f7f7f7]">{rewardToast && <div role="status" className="fixed right-4 top-4 z-[80] flex max-w-[calc(100vw-2rem)] items-center gap-4 rounded border border-[#777777] bg-white px-4 py-3 text-sm font-semibold text-[#111111] shadow-lg">{rewardToast}<button type="button" onClick={() => setRewardToast('')} aria-label="Dismiss notification" className="text-lg leading-none">×</button></div>}<header className="border-b border-[#111111] bg-[#111111]"><div className="mx-auto flex max-w-[1300px] justify-between px-5 py-5"><Link to="/admin" className="font-semibold underline">← Admin dashboard</Link><span className="text-sm text-[#777777]">Account details</span></div></header>
    <main className="mx-auto max-w-[1300px] space-y-6 px-5 py-9">
      <div className="rounded-2xl border border-[#111111] bg-[#111111] p-6 sm:p-8"><div className="flex flex-wrap items-start gap-5">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#111111] text-[#cccccc]">{seller?.logoUrl ? <img src={seller.logoUrl} alt="" className="size-full object-cover" /> : <UserRound size={28} />}</div>
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-widest text-[#cccccc]">Account folder · {user.role === 'customer' ? seller ? 'Seller applicant' : 'Buyer' : user.role} · #{user.publicId || '—'}</p><h1 className="mt-2 break-words text-3xl font-semibold">{user.fullName}</h1><p className="mt-2 flex items-center gap-2 break-all text-sm text-[#a3a3a3]"><Mail size={15} className="shrink-0" />{user.email}</p><p className="mt-1 text-sm text-[#a3a3a3]">{user.phone || 'No phone provided'} · Joined {user.createdAt} UTC</p><p className="mt-3 flex items-center gap-2 text-xs text-[#777777]"><ShieldCheck size={15} />Passwords and authentication secrets are never displayed.</p></div>
        {user.role !== 'admin' && <Link to={`/messages?user=${user.id}`} className="inline-flex items-center gap-2 rounded-full bg-[#cccccc] px-4 py-2 text-sm font-semibold text-[#111111]"><MessageSquare size={16} /> Message</Link>}
      </div></div>
      {error && <p role="alert" className="border border-red-500 p-3 text-sm">{error}</p>}
      {!user.deletedAt&&<SellerVerificationReview userId={user.id} onReviewed={refreshDetails} />}
      <nav aria-label="Account sections" className="flex flex-wrap gap-2 text-xs">{[['#account-details', 'Account details'], ...(user.role==='seller'&&!user.deletedAt?[['#seller-tools','Seller tools']]:[]), ['#activity', 'Activity'], ...(user.role === 'customer' ? [['#buyer-controls', 'Balance & requests'], ['#orders', 'Orders']] : []), ...(user.role === 'seller' ? [['#seller-products', 'Store & products']] : [])].map(([href, label]) => <a key={href} href={href} className="rounded-full border border-[#111111] bg-[#111111] px-4 py-2 hover:border-[#cccccc]">{label}</a>)}</nav>
      <section id="account-details" className={panel}><div className="flex items-center gap-2"><FolderOpen size={18} className="text-[#cccccc]" /><h2 className="font-semibold">Account details</h2></div><div className="mt-4 grid gap-4 text-sm sm:grid-cols-3"><p><span className="block text-xs text-[#777777]">Member ID</span><span className="mt-1 block font-mono">#{user.publicId || '—'}</span></p><p><span className="block text-xs text-[#777777]">Email</span><span className="mt-1 block break-all">{user.email}</span></p><p><span className="block text-xs text-[#777777]">Account type</span>{user.role === 'admin' ? <span className="mt-1 block">Admin</span> : <UiverseSelect value={user.role} disabled={busy} onChange={(event) => updateReview(`/api/admin/users/${user.id}/role`, { role: event.target.value })} className="mt-1 border border-[#111111] bg-[#111111] px-2 py-1"><option value="customer">BUYER</option><option value="seller" disabled={user.role!=='seller' && seller?.verificationStatus!=='approved'}>SELLER (approval required)</option></UiverseSelect>}</p></div></section>
      {seller&&<AdminStoreDates userId={user.id}/>}
      <DeleteAccount user={user} onDeleted={refreshDetails}/>
      {user.deletedAt&&accountHistory.length>0&&<section className={panel}><h2 className="font-semibold">Account audit history</h2>{accountHistory.map((entry,index)=><p key={index} className="mt-3 text-xs">{entry.createdAt} UTC · {entry.adminName} · {entry.action}: {entry.details}</p>)}</section>}
      {!user.deletedAt&&<AdminRecovery userId={user.id}/>}
      {!user.deletedAt&&user.role !== 'admin' && <section id="rewards" className={panel}><h2 className="font-semibold">Balance · USD</h2><p className="mt-2 text-2xl font-semibold">{formatMoney(rewards.balanceUnits)}</p><p className="mt-1 text-xs text-[#777777]">Store credit for purchases; no cash or cryptocurrency is transferred.</p><form onSubmit={adjustRewards} className="mt-4 flex flex-wrap items-end gap-3"><label className="text-xs">Action<UiverseSelect name="operation" className="mt-1 block border border-[#111111] bg-[#111111] px-3 py-2 text-sm"><option value="add">Add to balance</option><option value="reduce">Reduce balance</option></UiverseSelect></label><label className="text-xs">Amount (USD)<AmountInput key={amountKey} name="amount" placeholder="0.00" className="mt-1 block w-36 border border-[#111111] bg-[#111111] px-3 py-2 text-sm" /></label><button type="submit" disabled={busy} className="min-h-10 bg-[#cccccc] px-4 text-sm font-semibold text-[#111111] disabled:opacity-60">Update balance</button></form>{rewardHistory.length > 0 && <details className="mt-5 text-sm"><summary className="cursor-pointer text-[#cccccc]">Balance history</summary><div className="mt-3 space-y-3">{rewardHistory.map((entry) => <p key={entry.id} className="text-[#a3a3a3]">{entry.adjustmentUnits > 0 ? '+' : '−'}{formatMoney(Math.abs(entry.adjustmentUnits))} · Balance {formatMoney(entry.balanceUnits)}<br /><span className="text-xs text-[#777777]">{entry.adminName} · {entry.createdAt} UTC · {entry.reason}</span></p>)}</div></details>}</section>}
      {user.role !== 'admin' && balancePurchases.length > 0 && <section className={panel}><h2 className="font-semibold">Balance purchases</h2>{balancePurchases.map((entry) => <p key={entry.orderId} className="mt-3 text-sm text-[#a3a3a3]">Order #{entry.orderNumber} · −{formatMoney(entry.amountCents)} · Balance {formatMoney(entry.balanceCents)}<br /><span className="text-xs text-[#777777]">{entry.createdAt} UTC · Store credit</span></p>)}</section>}
      {!user.deletedAt&&user.role !== 'admin' && <section className={panel}><h2 className="font-semibold">Account status: {user.suspended ? 'Suspended' : 'Active'}</h2><p className="mt-2 text-sm text-[#a3a3a3]">Suspension signs the user out and blocks login. A suspended seller’s store and products are hidden until restored. Existing orders are retained.</p><form key={user.suspended} onSubmit={(event) => { event.preventDefault(); updateReview(`/api/admin/users/${user.id}/suspension`, { suspended: !user.suspended, reason: 'Account status changed by administrator' }) }} className="mt-4 flex flex-wrap items-end gap-3"><button disabled={busy} className="border border-[#111111] px-4 py-2 text-sm disabled:opacity-60">{user.suspended ? 'Restore account' : 'Suspend account'}</button></form>{accountHistory.length > 0 && <div className="mt-4 text-xs text-[#a3a3a3]"><h3 className="font-semibold">Admin activity</h3>{accountHistory.map((entry, index) => <p key={index} className="mt-2">{entry.createdAt} UTC · {entry.adminName} · {entry.action}: {entry.details}</p>)}</div>}</section>}
      {user.role === 'customer' && <div className="grid gap-4 md:grid-cols-2">
        <section className={panel}><h2 className="text-sm text-[#777777]">Manually confirmed deposit requests</h2><p className="mt-2 text-2xl">{formatMoney(confirmedDeposits)}</p><p className="mt-1 text-xs text-[#777777]">Requested USD amounts, not verified payments</p></section>
        <section className={panel}><h2 className="text-sm text-[#777777]">Purchase orders</h2><Link to="/admin#orders" className="mt-3 inline-block text-sm underline">Open Orders & tracking</Link></section>
      </div>}
      {seller && <section className={panel}><h2 className="text-lg font-semibold">Seller profile</h2><div className="mt-3 flex gap-4">{seller.logoUrl && <img src={seller.logoUrl} alt="" className="size-14 object-cover" />}<div className="text-sm"><p>{seller.storeName} · {seller.verificationStatus === 'demo_documents_not_stored' ? 'Identity files not stored' : seller.verificationStatus?.replaceAll('_', ' ')}</p><p className="mt-2 text-[#a3a3a3]">{seller.storeDescription || 'No description'}</p><p className="mt-2 text-[#a3a3a3]">{[seller.address, seller.city, seller.region, seller.postalCode, seller.country].filter(Boolean).join(', ') || 'No address'}</p><p className="mt-2 text-[#a3a3a3]">{seller.followerCount} admin-adjusted followers · {seller.visitorCount} visits</p>{user.role==='seller'&&<Link to={`/admin/seller-metrics?seller=${user.id}`} className="mt-2 inline-block text-[#cccccc] underline">Seller metrics</Link>}</div></div></section>}
      {user.role === 'seller' && seller && <section className={panel}><h2 className="font-semibold">Change store name</h2><form key={seller.storeName} onSubmit={(event) => { event.preventDefault(); updateReview(`/api/admin/users/${user.id}/store-name`, { storeName: new FormData(event.currentTarget).get('storeName') }) }} className="mt-3 flex flex-wrap items-end gap-3"><label className="text-xs">Store name<input name="storeName" defaultValue={seller.storeName} required maxLength={100} className="mt-1 block w-72 max-w-full border border-[#111111] bg-[#111111] px-3 py-2 text-sm" /></label><button disabled={busy} className="border border-[#111111] px-4 py-2 text-sm disabled:opacity-60">Save store name</button></form></section>}
      {user.role === 'seller' && !user.deletedAt && <section id="seller-tools" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-900">
        <h2 className="text-xl font-semibold">Seller tools</h2>
        <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer font-semibold">Fund seller and edit credit score</summary><AdminSellerFunding key={user.id} fixedSellerId={user.id}/></details>
        <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer font-semibold">Add historical sales</summary><SaleEntry key={user.id} sellerId={user.id}/></details>
        <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer font-semibold">Record a past credit or withdrawal</summary><AdminHistoricalWalletEntry key={user.id} sellerId={user.id}/></details>
        <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer font-semibold">Edit dashboard stats and store records</summary><AdminSellerMetricsPage key={user.id} sellerId={user.id}/></details>
      </section>}
      {user.role === 'seller' && <AdminSellerActuals sellerId={user.id} />}
      {user.role === 'seller' && <ReviewsPanel kind="store" id={user.id}/>}
      {!user.deletedAt&&user.role === 'customer' && <div id="buyer-controls"><AdminBuyers userId={user.id} onUpdated={refreshDetails} /></div>}
      {user.role === 'customer' && <div className="grid gap-6 md:grid-cols-2"><section className={panel}><h2 className="font-semibold">Favorite products</h2>{favorites.length ? favorites.map((product) => <Link key={product.id} to={`/products/${product.id}`} className="mt-3 flex items-center gap-3 text-sm underline"><img src={product.imageUrl} alt="" className="size-12 rounded object-cover" />{product.name}</Link>) : <p className="mt-3 text-sm text-[#777777]">No favorites recorded.</p>}</section><section className={panel}><h2 className="font-semibold">Followed stores</h2>{follows.length ? follows.map((store) => <Link key={store.sellerId} className="mt-3 block text-sm text-[#a3a3a3] underline" to={`/admin/users/${store.sellerId}`}>{store.storeName}</Link>) : <p className="mt-3 text-sm text-[#777777]">No followed stores.</p>}</section></div>}
      {user.role === 'customer' && <div className="grid gap-6 md:grid-cols-2"><section className={panel}><h2 className="font-semibold">Saved addresses</h2>{addresses.length ? addresses.map((address) => <p key={address.id} className="mt-3 text-sm text-[#a3a3a3]">{address.fullName} · {address.phone}<br />{address.address}, {address.city}, {address.region} {address.postalCode}, {address.country}{address.isDefault ? ' (default)' : ''}</p>) : <p className="mt-3 text-sm text-[#777777]">No saved addresses.</p>}</section><section className={panel}><h2 className="font-semibold">Visited stores</h2>{visits.length ? visits.map((visit) => <p key={visit.sellerId} className="mt-3 text-sm text-[#a3a3a3]">{visit.storeName} · {visit.visitCount} visits · Last {visit.lastVisitedAt} UTC</p>) : <p className="mt-3 text-sm text-[#777777]">No visits recorded.</p>}</section></div>}
      {user.role === 'customer' && <>
      <section className={panel}><h2 className="font-semibold">Cancellation requests</h2><p className="mt-2 text-xs text-[#777777]">Review does not delete or disable the account.</p>{cancellationRequests.map((request) => <div key={request.id} className="mt-3 border-t border-[#111111] pt-3 text-sm"><p>#{request.id} · {request.status} · {request.createdAt} UTC</p>{request.status === 'pending' && <div className="mt-2 flex gap-3"><button disabled={busy} onClick={() => updateReview(`/api/admin/cancellation-requests/${request.id}`, { status: 'reviewed' })} className="underline">Mark reviewed</button><button disabled={busy} onClick={() => updateReview(`/api/admin/cancellation-requests/${request.id}`, { status: 'declined' })} className="underline">Decline</button></div>}</div>)}{!cancellationRequests.length && <p className="mt-3 text-sm text-[#777777]">No cancellation requests.</p>}</section></>}
      <div id="activity" className="grid gap-6 md:grid-cols-2"><section className={panel}><h2 className="font-semibold">Account activity</h2>{events.length ? events.map((event, index) => <p key={`${event.createdAt}-${index}`} className="mt-3 text-sm text-[#a3a3a3]">{event.type === 'registered' ? 'Registered' : 'Signed in'} · {event.createdAt} UTC<br/><span className="break-words text-xs">IP: {event.ipAddress||'Not recorded'} · {event.location?`${event.location} (approximate)`:'Location unavailable'}</span></p>) : <p className="mt-3 text-sm text-[#777777]">No account activity recorded.</p>}</section><section className={panel}><h2 className="font-semibold">Manual wallet history</h2>{balanceResets.map((reset, index) => <p key={`reset-${index}`} className="mt-3 text-sm text-[#a3a3a3]">Reset from {formatMoney(reset.previousCents)} to $0.00 · {reset.resetAt} UTC</p>)}{balanceHistory.map((entry, index) => <p key={index} className="mt-3 text-sm text-[#a3a3a3]">{formatMoney(entry.oldCents)} → {formatMoney(entry.newCents)} · {entry.adminName} · {entry.createdAt} UTC<br />{entry.reason}</p>)}{!balanceHistory.length && !balanceResets.length && <p className="mt-3 text-sm text-[#777777]">No changes recorded.</p>}</section></div>
      {user.role === 'seller' && <section id="seller-products" className={panel}><h2 className="font-semibold">Seller products</h2>{products.length ? products.map((product) => <div key={product.id} className="mt-3 flex items-center gap-3 text-sm"><img src={product.imageUrl} alt="" className="size-12 rounded object-cover" /><span>{product.name} · {formatMoney(Math.round(product.price * 100))} · {product.isPublished ? 'Published' : 'Draft'}</span></div>) : <p className="mt-3 text-sm text-[#777777]">No products recorded.</p>}</section>}
    </main></div>
}

export default AdminUserDetailsPage
