import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api.js'
import { formatMoney as money } from '../lib/money.js'

const coins = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'LTC']
const input = 'mt-1 w-full border border-[#3b5140] bg-[#101c13] px-3 py-2 text-sm text-white'

const AdminBuyers = ({ userId, onUpdated }) => {
  const [buyers, setBuyers] = useState([])
  const [requests, setRequests] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [updatesError, setUpdatesError] = useState('')
  const refresh = async () => {
    const data = await apiRequest('/api/admin/buyers', { background: true })
    setBuyers(data.buyers)
    setRequests(data.requests)
  }
  useEffect(() => {
    let active = true
    apiRequest('/api/admin/buyers').then((data) => {
      if (active) { setBuyers(data.buyers); setRequests(data.requests); setLoading(false) }
    }).catch((error) => { if (active) { setMessage(error.message); setLoading(false) } })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (busy) return
    let active = true
    const timer = window.setInterval(async () => {
      try {
        const data = await apiRequest('/api/admin/buyers')
        if (active) {
          setBuyers(data.buyers)
          setRequests(data.requests)
          setUpdatesError('')
        }
      } catch (error) {
        if (active) setUpdatesError(`Automatic updates unavailable: ${error.message}`)
      }
    }, 15000)
    return () => { active = false; window.clearInterval(timer) }
  }, [busy])

  const updateRequest = async (event, request) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const status = event.nativeEvent.submitter.value
    setBusy(true); setMessage('')
    try {
      await apiRequest(`/api/admin/buyer-requests/${request.id}`, { method: 'PATCH', body: JSON.stringify({ status, instructions: data.get('instructions'), ...(request.kind === 'deposit' ? { paymentCoin: data.get('paymentCoin'), network: data.get('network'), walletAddress: data.get('walletAddress') } : {}) }) })
      await refresh()
      if (onUpdated) await onUpdated()
      setMessage(`Request #${request.id} updated. The balance was not changed.`)
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const visibleBuyers = userId == null ? buyers : buyers.filter((buyer) => buyer.id === Number(userId))
  const visibleRequests = userId == null ? requests : requests.filter((request) => request.userId === Number(userId))
  return (
    <section id="buyers" className="mb-8 border border-[#263c2d] bg-[#0d1b12]">
      <div className="border-b border-[#263c2d] px-5 py-4 sm:px-7"><h2 className="text-lg font-semibold">Buyer profiles & manual requests</h2><p className="mt-1 text-xs leading-5 text-[#9baa9d]">Requests are manually reviewed; no transfer or verification is performed. Confirming a request does not change the balance.</p></div>
      {message && <p role="status" className="mx-5 mt-4 border border-[#76513f] p-3 text-sm text-[#f3c7ac]">{message}</p>}
      {updatesError && <p role="alert" className="mx-5 mt-4 border border-[#76513f] p-3 text-sm text-[#f3c7ac]">{updatesError}</p>}
      {loading ? <p className="p-5 text-sm">Loading buyers…</p> : <>
        <div className="divide-y divide-[#263c2d]">{visibleBuyers.map((buyer) => <article key={buyer.id} className="p-5 sm:px-7">
          <div><h3 className="font-semibold"><Link to={`/admin/users/${buyer.id}`} className="underline">{buyer.fullName}</Link> <span className="font-mono text-xs text-[#9baa9d]">#{buyer.id}</span></h3><p className="mt-1 break-all text-sm text-[#b8c2b9]">{buyer.email} · {buyer.phone || 'No phone'}</p><p className="mt-3 text-xs text-[#9baa9d]">Addresses: {buyer.addresses.length ? buyer.addresses.map((address) => `${address.address}, ${address.city}, ${address.country}${address.isDefault ? ' (default)' : ''}`).join(' · ') : 'None'}</p><p className="mt-2 text-xs text-[#9baa9d]">Stores visited: {buyer.visits.length ? buyer.visits.map((visit) => `${visit.storeName} (${visit.visitCount})`).join(' · ') : 'None'}</p></div>
        </article>)}{!visibleBuyers.length && <p className="p-5 text-sm text-[#9baa9d]">No buyer profile available.</p>}</div>
        <div className="border-t border-[#263c2d] p-5 sm:px-7"><h3 className="font-semibold">Deposit and withdrawal requests</h3><div className="mt-3 divide-y divide-[#263c2d]">{visibleRequests.map((request) => <article key={request.id} className="py-4 text-sm"><p className="font-medium">#{request.id} · <Link to={`/admin/users/${request.userId}`} className="underline">{request.fullName} (#{request.userId})</Link> · {request.kind} · requested {request.coin} · {money(request.amountCents)} · <span className="uppercase text-[#c8f135]">{request.status}</span></p><p className="mt-1 text-xs text-[#9baa9d]">{request.email} · {request.createdAt} UTC</p>{request.destination && <p className="mt-2 break-all text-xs">Destination and network: {request.destination}</p>}{request.receipts.map((receipt) => <p key={receipt.id} className="mt-2 text-xs">Screenshot for {receipt.coin} on {receipt.network}, wallet {receipt.walletAddress} · {receipt.createdAt} UTC · <a href={`/api/admin/receipts/${receipt.id}`} className="underline">Download screenshot</a></p>)}{request.status === 'pending' ? <form onSubmit={(event) => updateRequest(event, request)} className="mt-3">{request.kind === 'deposit' && <div className="grid gap-2 sm:grid-cols-3"><label className="text-xs">Accepted coin<select name="paymentCoin" defaultValue={request.paymentCoin || request.coin} className={input}>{coins.map((coin) => <option key={coin}>{coin}</option>)}</select></label><label className="text-xs">Network<input name="network" defaultValue={request.network} maxLength={100} className={input} /></label><label className="text-xs">Wallet address<input name="walletAddress" defaultValue={request.walletAddress} maxLength={500} className={input} /></label></div>}<label className="mt-2 block text-xs">Additional instructions<textarea name="instructions" defaultValue={request.instructions} maxLength={2000} rows={2} className={input} /></label><div className="mt-2 flex flex-wrap gap-2"><button disabled={busy} name="status" value="pending" className="border border-[#3b5140] px-3 py-2 text-xs disabled:opacity-60">Send / update payment details</button><button disabled={busy} name="status" value="confirmed" className="border border-[#c8f135] px-3 py-2 text-xs text-[#c8f135] disabled:opacity-60">Confirm manually</button><button disabled={busy} name="status" value="rejected" className="border border-[#76513f] px-3 py-2 text-xs text-[#f3c7ac] disabled:opacity-60">Reject</button></div><p className="mt-2 text-xs text-[#9baa9d]">Screenshots are not proof of settlement. Verify independently before confirming. Confirmation does not change balance.</p></form> : <p className="mt-2 whitespace-pre-wrap text-xs">{request.instructions}</p>}</article>)}{!visibleRequests.length && <p className="py-4 text-sm text-[#9baa9d]">No requests yet.</p>}</div></div>
      </>}
    </section>
  )
}

export default AdminBuyers
