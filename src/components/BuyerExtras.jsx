import PasswordInput from './PasswordInput.jsx'
import TransactionPinSettings from './TransactionPinSettings.jsx'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api.js'
import BuyerOrders from './BuyerOrders.jsx'

const panel = 'rounded-2xl border border-[#e5e5e5] bg-white p-5 sm:p-6'
const field = 'mt-1 block w-full rounded border border-[#e5e5e5] px-3 py-2 text-sm'
const button = 'mt-3 bg-[#111111] px-4 py-2 text-sm text-white disabled:opacity-60'

const BuyerExtras = ({ profile, onRefresh, section }) => {
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event, path, method, success) => {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true); setError(''); setNotice('')
    try {
      await apiRequest(path, { method, body: JSON.stringify(Object.fromEntries(new FormData(form))) })
      if (path !== '/api/buyer/account') form.reset()
      await onRefresh()
      setNotice(success)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const removeFavorite = async (id) => {
    setBusy(true); setError(''); setNotice('')
    try { await apiRequest(`/api/buyer/favorites/${id}`, { method: 'DELETE' }); await onRefresh() }
    catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <>
    {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="border border-green-200 bg-green-50 p-3 text-sm">{notice}</p>}
    {section === 'orders' && <BuyerOrders />}
    {section === 'favorites' && <section id="favorites" className={panel}>
      <h2 className="font-semibold">Favorite products</h2>
      {profile.favorites.length ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profile.favorites.map((product) => <article key={product.id} className="overflow-hidden rounded-xl border border-[#e5e5e5]">
          <Link to={`/products/${product.id}`} aria-label={`View ${product.name} details`} className="block aspect-[4/3] bg-[#f1f1ef]">
            <img src={product.imageUrl} alt={product.name} loading="lazy" className="size-full object-cover" />
          </Link>
          <div className="flex items-start justify-between gap-3 p-4 text-sm">
            <Link to={`/products/${product.id}`} className="min-w-0 font-medium hover:underline">{product.name}</Link>
            <button type="button" disabled={busy} onClick={() => removeFavorite(product.id)} aria-label={`Remove ${product.name} from favorites`} className="shrink-0 text-xs underline disabled:opacity-60">Remove</button>
          </div>
        </article>)}
      </div> : <p className="mt-3 text-sm text-[#555555]">No favorite products yet. Use Favorite on a product page.</p>}
    </section>}
    {section === 'setup' && <section id="setup" className={panel}>
      <h2 className="font-semibold">Setup</h2>
      <p className="mt-2 text-sm">Manage your <Link to="/profile/addresses" className="underline">billing addresses</Link>.</p>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <form onSubmit={(event) => submit(event, '/api/buyer/account', 'PATCH', 'Account details updated.')}><h3 className="font-medium">Name and phone</h3><label className="mt-2 block text-sm">Name<input name="fullName" defaultValue={profile.user.fullName} maxLength={100} required className={field} /></label><label className="mt-2 block text-sm">Phone<input name="phone" defaultValue={profile.user.phone || ''} maxLength={30} className={field} /></label><button disabled={busy} className={button}>Save details</button></form>
        <form onSubmit={(event) => submit(event, '/api/buyer/password', 'PUT', 'Login password changed. Other sessions were signed out.')}><h3 className="font-medium">Change login password</h3><label className="mt-2 block text-sm">Current login password<PasswordInput  name="currentPassword" autoComplete="current-password" required className={field} /></label><label className="mt-2 block text-sm">New login password<PasswordInput  name="newPassword" autoComplete="new-password" minLength={8} required className={field} /></label><button disabled={busy} className={button}>Change password</button></form>
        <TransactionPinSettings onSaved={onRefresh} />
        <form onSubmit={(event) => submit(event, '/api/buyer/cancellation-request', 'POST', 'Cancellation request sent for administrator review. Your account is not deleted.')}><h3 className="font-medium">Request account cancellation</h3><p className="mt-1 text-xs text-[#555555]">An administrator reviews the request; this does not automatically delete your account.</p><label className="mt-2 block text-sm">Confirm login password<PasswordInput  name="password" autoComplete="current-password" required className={field} /></label><button disabled={busy} className={button}>Request review</button></form>
      </div>
    </section>}
  </>
}

export default BuyerExtras
