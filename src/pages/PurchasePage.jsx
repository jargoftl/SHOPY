import ContentPlaceholder from '../components/ContentPlaceholder.jsx'
import DeliveryProgress from '../components/DeliveryProgress.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IoCopyOutline } from 'react-icons/io5'
import { apiRequest, trackedFetch } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'
import SiteName from '../components/SiteName.jsx'

const PurchasePage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(true)
  const dialog = useRef(null)
  const previousStatus = useRef(null)

  useEffect(() => {
    let active = true
    const load = async (background = false) => {
      try {
        const { order: result } = await apiRequest(`/api/purchases/${id}`, { background })
        if (!active) return
        if (previousStatus.current && previousStatus.current !== result.status && ['awaiting_receipt', 'paid'].includes(result.status)) setDialogOpen(true)
        previousStatus.current = result.status
        setOrder(result)
        setError('')
      } catch (err) {
        if (!active) return
        if (err.status === 401) navigate('/login', { replace: true })
        else setError(err.message)
      }
    }
    load()
    const timer = window.setInterval(() => load(true), 10000)
    return () => { active = false; window.clearInterval(timer) }
  }, [id, navigate])

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (dialogOpen && !element.open) element.showModal()
    if (!dialogOpen && element.open) element.close()
  }, [dialogOpen, order])

  const upload = async (event) => {
    event.preventDefault()
    const file = new FormData(event.currentTarget).get('receipt')
    if (!(file instanceof File) || !['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) { setError('Choose a PNG or JPEG screenshot up to 2 MB.'); return }
    setBusy(true); setError('')
    try {
      const response = await trackedFetch(`/api/purchases/${id}/receipt`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type }, body: file })
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Upload failed.') }
      navigate('/profile/orders', { replace: true, state: { orderToast: `Order #${order.orderNumber}: receipt submitted. Payment is pending admin verification.` } })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(order.walletAddress); setNotice('Wallet address copied.') }
    catch { setNotice('Could not copy the address. Select it and copy it manually.') }
  }

  return <main className="min-h-screen bg-[#f7f7f7] px-5 py-8 text-[#111111]">
    <div className="mx-auto max-w-3xl"><Link to="/" className="text-2xl font-black"><SiteName logo /></Link>
      <div className="mt-8 rounded-2xl border border-[#e5e5e5] bg-white p-6 sm:p-8">
        <p className="text-xs uppercase tracking-widest text-[#555555]">Order #{order?.orderNumber || "…"}</p><h1 className="mt-2 text-3xl font-semibold">Your order</h1>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-4 text-sm text-[#111111]">{notice}</p>}
        {!order ? <ContentPlaceholder/> : <>
          <p className="mt-4 text-sm">Status: <strong>{order.status.replaceAll('_', ' ')}</strong> · {order.coin === 'BALANCE' ? 'Account balance' : order.coin}</p>
          <p className="mt-2 text-sm">Items: {order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</p>
          <p className="mt-2 text-sm">Subtotal: {formatMoney(order.subtotalCents)}{order.shippingCents !== null && ` · Shipping: ${formatMoney(order.shippingCents)} · Tax: ${formatMoney(order.taxCents)} · Total: ${formatMoney(order.subtotalCents + order.shippingCents + order.taxCents)}`}</p>
          {['awaiting_quote', 'awaiting_receipt', 'paid'].includes(order.status) && <button type="button" onClick={() => setDialogOpen(true)} className="mt-5 rounded bg-[#111111] px-4 py-2 text-sm text-white">View {order.status === 'paid' ? 'confirmation' : 'payment details'}</button>}
          {order.status === 'awaiting_receipt' && <form onSubmit={upload} className="mt-6 border-t border-[#e5e5e5] pt-5"><label className="block text-sm font-medium">Upload payment screenshot<input name="receipt" type="file" accept="image/png,image/jpeg" required className="mt-2 block w-full text-sm" /></label><button disabled={busy} className="mt-4 rounded bg-[#111111] px-4 py-2 text-sm text-white disabled:opacity-60">{busy ? 'Uploading…' : 'Send receipt'}</button><p className="mt-3 text-xs text-[#555555]">The support team must independently verify the transfer before confirming payment.</p></form>}
          {order.status === 'awaiting_review' && <p className="mt-5 text-sm">Your screenshot is awaiting support team review. It is not proof of payment.</p>}
          {order.status === 'rejected' && <p className="mt-5 text-sm">Payment was not confirmed. Contact the support team through messages.</p>}
          <div className="mt-5 space-y-3">{order.sellers.map(s=><div key={s.sellerId} className="border p-4 text-sm"><strong>{s.storeName}</strong><div className="mt-3"><DeliveryProgress status={s.status}/></div>{s.trackingNumber&&<p className="mt-2 break-all">Tracking: {s.trackingNumber} · {s.carrier}</p>}</div>)}</div><div className="mt-6 flex gap-5 text-sm"><Link className="underline" to="/orders">My orders</Link><Link className="underline" to="/messages">Message support</Link></div>
        </>}
      </div>
    </div>
    {order && <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); setDialogOpen(false) }} aria-labelledby="purchase-dialog-title" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl bg-white p-6 text-[#111111] shadow-xl backdrop:bg-black/50">
      <div className="flex justify-between gap-4"><h2 id="purchase-dialog-title" className="text-xl font-semibold">{order.status === 'awaiting_quote' ? 'Waiting for payment details' : order.status === 'paid' ? 'Thank you!' : 'Transfer payment'}</h2><button type="button" onClick={() => setDialogOpen(false)} aria-label="Close dialog" className="text-2xl">×</button></div>
      {order.status === 'awaiting_quote' && <div role="status" className="mt-6 flex items-center gap-3 text-sm"><span className="size-5 animate-spin rounded-full border-2 border-[#cccccc] border-t-[#111111]" />Waiting for the support to set your final amount and wallet. You can return from My Orders.</div>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {order.status === 'awaiting_receipt' && <><p className="mt-4 text-sm">Transfer the exact amount of items you are buying, no tips. Thank you.</p><p className="mt-4 text-sm font-semibold">Send {order.coinAmount} {order.coin} · {order.network}</p><p className="mt-1 text-xs text-[#111111]">Final order total: {formatMoney(order.subtotalCents + order.shippingCents + order.taxCents)}</p>{order.usdRate && <p className="mt-1 text-xs text-[#111111]">support-set rate: 1 {order.coin} = ${order.usdRate} USD. This is not a live rate.</p>}<div className="mt-3 flex items-center gap-3 rounded border border-[#e5e5e5] bg-[#f7f7f7] p-3"><span className="min-w-0 flex-1 break-all font-mono text-sm">{order.walletAddress}</span><button type="button" onClick={copy} aria-label="Copy wallet address" className="grid size-10 place-items-center rounded border border-[#cccccc]"><IoCopyOutline size={20} /></button></div>{notice && <p role="status" className="mt-2 text-xs">{notice}</p>}<p className="mt-3 text-xs text-[#555555]">Check the coin and network carefully. Transfers are verified manually.</p><button type="button" onClick={() => setDialogOpen(false)} className="mt-5 bg-[#111111] px-4 py-2 text-sm text-white">Continue to receipt</button></>}
      {order.status === 'paid' && <p className="mt-5 text-sm">{order.coin === 'BALANCE' ? 'Your account balance has been charged. The store owner or support team will confirm and process your order.' : 'Your payment was confirmed by the support team. Thank you for your order!'}</p>}
      {['awaiting_review', 'rejected'].includes(order.status) && <p className="mt-4 text-sm">Your order is {order.status.replaceAll('_', ' ')}.</p>}
    </dialog>}
  </main>
}

export default PurchasePage
