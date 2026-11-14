import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api.js'
import { coinDetails } from '../lib/coins.js'
import { formatMoney, parseAmountCents } from '../lib/money.js'
import { fulfillmentOptions, fulfillmentLabel, paymentStatusLabel } from '../lib/fulfillment.js'
import OrderStatusBadge from './OrderStatusBadge.jsx'

const field = 'mt-1 block w-full rounded border border-[#3b5140] bg-[#101c13] px-3 py-2 text-sm text-white'
const button = 'rounded border border-[#526b54] px-3 py-2 text-xs hover:border-[#c8f135] disabled:opacity-50'

const AdminPurchases = ({ selectedNumber }) => {
  const [orders, setOrders] = useState([])
  const [wallets, setWallets] = useState([])
  const [coin, setCoin] = useState('BTC')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    Promise.all([apiRequest('/api/admin/purchases'), apiRequest('/api/admin/payment-wallets')])
      .then(([purchaseData, walletData]) => { if (active) { setOrders(purchaseData.orders); setWallets(walletData.wallets) } })
      .catch((error) => { if (active) setMessage(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])
  const run = async (operation, success) => {
    setBusy(true); setMessage('')
    try { await operation(); setMessage(success); setReload((value) => value + 1) }
    catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const saveWallet = (event) => {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    run(() => apiRequest(`/api/admin/payment-wallets/${coin}`, { method: 'PUT', body: JSON.stringify(data) }), 'Wallet and rate saved for new orders. Existing order quotes remain unchanged.')
  }
  const saveQuote = (event, order) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const shippingCents = parseAmountCents(data.get('shipping'))
    const taxCents = parseAmountCents(data.get('tax'))
    if (shippingCents === null || taxCents === null) { setMessage('Enter valid shipping and tax amounts.'); return }
    run(() => apiRequest(`/api/admin/purchases/${order.id}/quote`, { method: 'PUT', body: JSON.stringify({ shippingCents, taxCents, coinAmount: data.get('coinAmount') }) }), `Quote sent for order #${order.orderNumber}.`)
  }
  const wallet = wallets.find((item) => item.coin === coin)
  return <details id="purchase-orders" open={selectedNumber ? true : undefined} className="mb-8 border border-[#263c2d] bg-[#0d1b12] p-5 sm:p-7">
    <summary className="cursor-pointer text-lg font-semibold">Orders & manual payments<span className="mt-1 block text-xs font-normal text-[#9baa9d]">Configure coin wallets and rates, review receipts, and independently verify transfers before confirmation.</span></summary>
    <div className="mt-4 flex justify-end"><button onClick={() => setReload((value) => value + 1)} className={button}>Refresh</button></div>
    {message && <p role="status" className="mt-4 text-sm text-[#f3c7ac]">{message}</p>}
    <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Select wallet coin">{Object.entries(coinDetails).map(([code, details]) => <button key={code} type="button" aria-pressed={coin === code} onClick={() => setCoin(code)} className={`rounded border px-3 py-2 text-xs ${coin === code ? 'border-[#c8f135] bg-[#263d2b] text-[#c8f135]' : 'border-[#3b5140]'}`}><span aria-hidden="true">{details[1]}</span> {code} · {wallets.some((item) => item.coin === code && item.usdRate) ? 'Ready' : 'Not set'}</button>)}</div>
    <form onSubmit={saveWallet} className="mt-3 grid gap-3 rounded border border-[#263c2d] p-4 sm:grid-cols-3">
      <label className="text-xs">Coin<select value={coin} onChange={(event) => setCoin(event.target.value)} className={field}>{Object.keys(coinDetails).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs">Network<input key={`${coin}-network-${wallet?.network || ''}`} name="network" defaultValue={wallet?.network || ''} maxLength={100} required className={field} /></label>
      <label className="text-xs">Wallet address<input key={`${coin}-address-${wallet?.address || ''}`} name="address" defaultValue={wallet?.address || ''} maxLength={500} required className={field} /></label>
      <label className="text-xs">USD per 1 {coin}<input key={`${coin}-rate-${wallet?.usdRate || ''}`} name="usdRate" defaultValue={wallet?.usdRate || ''} placeholder="e.g. 65000" inputMode="decimal" required className={field} /></label>
      <p className="self-end text-xs leading-5 text-[#b8c2b9]">Update the rate regularly. New orders use this rate; existing orders keep their original wallet and amount.</p>
      <button disabled={busy} className={button}>Save wallet</button>
    </form>
    {loading ? <p className="mt-4 text-sm">Loading orders…</p> : orders.length ? <div className="mt-4 divide-y divide-[#263c2d]">{orders.map((order) => <details key={order.id} open={selectedNumber === String(order.orderNumber) ? true : undefined} className="py-5 text-sm">
      <summary className="cursor-pointer font-semibold"><span>Order #{order.orderNumber} · {order.buyerName} · {order.coin === 'BALANCE' ? 'Store credit' : order.coin}</span><span className="ml-2 inline-block align-middle"><OrderStatusBadge status={order.status} label={paymentStatusLabel(order.status)} /></span></summary>
      {order.coin === 'BALANCE' && <p className="mt-2 text-xs text-[#b8c2b9]">Paid using store credit; no external payment or payout was processed.</p>}
      <p className="mt-2 text-xs text-[#b8c2b9]">{order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')} · Subtotal {formatMoney(order.subtotalCents)}</p>
      <p className="mt-2 text-xs text-[#b8c2b9]">Billing: {Object.values(order.billing).join(', ')}</p>
      {order.coinAmount && <p className="mt-2 break-all text-xs">Quote: {order.coinAmount} {order.coin} · {order.network} · {order.walletAddress} · Total {formatMoney(order.subtotalCents + order.shippingCents + order.taxCents)}</p>}
      {order.status === 'awaiting_quote' && <form onSubmit={(event) => saveQuote(event, order)} className="mt-3 grid gap-2 sm:grid-cols-3"><label className="text-xs">Shipping USD<input name="shipping" defaultValue="0" required className={field} /></label><label className="text-xs">Tax USD<input name="tax" defaultValue="0" required className={field} /></label><label className="text-xs">Exact {order.coin} amount<input name="coinAmount" required placeholder="0.00000000" className={field} /></label><button disabled={busy} className={button}>Send quote and wallet</button></form>}
      {order.receipts.map((receipt) => <details key={receipt.id} className="mt-3 text-xs"><summary className="cursor-pointer underline">View payment screenshot · {receipt.createdAt} UTC</summary><img src={`/api/admin/purchase-receipts/${receipt.id}`} alt={`Payment screenshot for order ${order.orderNumber}`} className="mt-3 max-h-[28rem] max-w-full rounded border border-[#526b54] object-contain" onError={() => setMessage('Could not load the payment screenshot. Check your connection and admin session.')} /><a className="mt-2 inline-block underline" href={`/api/admin/purchase-receipts/${receipt.id}`} target="_blank" rel="noreferrer">Open screenshot in a new tab</a></details>)}
      {order.status === 'awaiting_review' && <form onSubmit={(event) => { event.preventDefault(); const verified = new FormData(event.currentTarget).has('verified'); run(() => apiRequest(`/api/admin/purchases/${order.id}/payment`, { method: 'PATCH', body: JSON.stringify({ status: 'paid', verified }) }), 'Payment confirmed and sellers notified.') }} className="mt-3"><label className="text-xs"><input type="checkbox" name="verified" required /> I independently verified the transfer, amount and network.</label><div className="mt-2 flex gap-2"><button disabled={busy} className={button}>Confirm payment</button><button type="button" disabled={busy} onClick={() => run(() => apiRequest(`/api/admin/purchases/${order.id}/payment`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) }), 'Payment declined.')} className={button}>Decline</button></div></form>}
      {order.sellers.map((seller) => <div key={seller.sellerId} className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="font-medium">{seller.storeName}</span><OrderStatusBadge status={seller.status} label={fulfillmentLabel(seller.status)} />{order.status === 'paid' ? <><Link className="underline" to={`/messages?user=${seller.sellerId}`}>Message seller</Link><select aria-label={`Update status for ${seller.storeName}`} disabled={busy} value={seller.status} onChange={(event) => run(() => apiRequest(`/api/purchase-sellers/${order.id}/${seller.sellerId}`, { method: 'PATCH', body: JSON.stringify({ status: event.target.value }) }), 'Status updated.')} className="border border-[#526b54] bg-[#101c13] p-2">{fulfillmentOptions.map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></> : <span className="text-[#b8c2b9]">Payment not confirmed</span>}</div>)}
    </details>)}</div> : <p className="mt-4 text-sm text-[#9baa9d]">No orders yet.</p>}
  </details>
}
export default AdminPurchases
