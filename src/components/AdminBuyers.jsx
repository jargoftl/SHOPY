import UiverseSelect from './UiverseSelect.jsx'
import ContentPlaceholder from './ContentPlaceholder.jsx'
import {sessionUrl} from '../lib/tabSession.js'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../lib/api.js'
import { formatMoney as money } from '../lib/money.js'

const coins = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'LTC']
const input = 'mt-1 w-full border border-[#111111] bg-[#111111] px-3 py-2 text-sm text-white'

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
      await apiRequest(`/api/admin/buyer-requests/${request.id}`, { method: 'PATCH', body: JSON.stringify({ status, instructions: data.get('instructions'), verified:data.get('verified')==='on',transferReference:data.get('transferReference'), ...(request.kind === 'deposit' ? { paymentCoin: data.get('paymentCoin'), network: data.get('network'), walletAddress: data.get('walletAddress') } : {}) }) })
      await refresh()
      if (onUpdated) await onUpdated()
      setMessage(`Request #${request.id} updated. Confirmed transfers update the account balance once.`)
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const visibleBuyers = userId == null ? buyers : buyers.filter((buyer) => buyer.id === Number(userId))
  const visibleRequests = userId == null ? requests : requests.filter((request) => request.userId === Number(userId))
  return (
    <section id="buyers" className="mb-8 border border-[#111111] bg-[#111111]">
      <div className="border-b border-[#111111] px-5 py-4 sm:px-7"><h2 className="text-lg font-semibold">Buyer profiles & manual requests</h2><p className="mt-1 text-xs leading-5 text-[#777777]">Confirm a transfer only after independently verifying it. A verified deposit credits the buyer’s actual spendable balance exactly once.</p></div>
      {message && <p role="status" className="mx-5 mt-4 border border-[#111111] p-3 text-sm text-[#cccccc]">{message}</p>}
      {updatesError && <p role="alert" className="mx-5 mt-4 border border-[#111111] p-3 text-sm text-[#cccccc]">{updatesError}</p>}
      {loading ? <ContentPlaceholder/> : <>
        <div className="divide-y divide-[#111111]">{visibleBuyers.map((buyer) => <article key={buyer.id} className="p-5 sm:px-7">
          <div><h3 className="font-semibold"><Link to={`/admin/users/${buyer.id}`} className="underline">{buyer.fullName}</Link> <span className="font-mono text-xs text-[#777777]">#{buyer.publicId}</span></h3><p className="mt-1 break-all text-sm text-[#a3a3a3]">{buyer.email} · {buyer.phone || 'No phone'}</p><p className="mt-3 text-xs text-[#777777]">Addresses: {buyer.addresses.length ? buyer.addresses.map((address) => `${address.address}, ${address.city}, ${address.country}${address.isDefault ? ' (default)' : ''}`).join(' · ') : 'None'}</p><p className="mt-2 text-xs text-[#777777]">Stores visited: {buyer.visits.length ? buyer.visits.map((visit) => `${visit.storeName} (${visit.visitCount})`).join(' · ') : 'None'}</p></div>
        </article>)}{!visibleBuyers.length && <p className="p-5 text-sm text-[#777777]">No buyer profile available.</p>}</div>
        <div className="border-t border-[#111111] p-5 sm:px-7"><h3 className="font-semibold">Deposit and withdrawal requests</h3><div className="mt-3 divide-y divide-[#111111]">{visibleRequests.map((request) => <article key={request.id} className="py-4 text-sm"><p className="font-medium">#{request.id} · <Link to={`/admin/users/${request.userId}`} className="underline">{request.fullName} (#{request.publicId})</Link> · {request.kind} · requested {request.coin} · {money(request.amountCents)} · <span className="uppercase text-[#cccccc]">{request.status}</span></p><p className="mt-1 text-xs text-[#777777]">{request.email} · {request.createdAt} UTC</p>{request.destination && <p className="mt-2 break-all text-xs">Destination and network: {request.destination}</p>}{request.receipts.map((receipt) => <p key={receipt.id} className="mt-2 text-xs">Screenshot for {receipt.coin} on {receipt.network}, wallet {receipt.walletAddress} · {receipt.createdAt} UTC · <a href={sessionUrl(`/api/admin/receipts/${receipt.id}`)} className="underline">Download screenshot</a></p>)}{request.status === 'pending' ? <form onSubmit={(event) => updateRequest(event, request)} className="mt-3">{request.kind === 'deposit' && <div className="grid gap-2 sm:grid-cols-3"><label className="text-xs">Accepted coin<UiverseSelect name="paymentCoin" defaultValue={request.paymentCoin || request.coin} className={input}>{coins.map((coin) => <option key={coin}>{coin}</option>)}</UiverseSelect></label><label className="text-xs">Network<input name="network" defaultValue={request.network} maxLength={100} className={input} /></label><label className="text-xs">Wallet address<input name="walletAddress" defaultValue={request.walletAddress} maxLength={500} className={input} /></label></div>}<label className="mt-2 block text-xs">Additional instructions<textarea name="instructions" defaultValue={request.instructions} maxLength={2000} rows={2} className={input} /></label><label className="mt-3 block text-xs">Transaction reference (required to confirm)<input name="transferReference" maxLength={300} className={input}/></label><label className="mt-3 block text-xs"><input type="checkbox" name="verified"/> I independently verified the incoming deposit or outgoing withdrawal transfer.</label><div className="mt-2 flex flex-wrap gap-2"><button disabled={busy} name="status" value="pending" className="border border-[#111111] px-3 py-2 text-xs disabled:opacity-60">Send / update payment details</button><button disabled={busy} name="status" value="confirmed" className="border border-[#cccccc] px-3 py-2 text-xs text-[#cccccc] disabled:opacity-60">Confirm manually</button><button disabled={busy} name="status" value="rejected" className="border border-[#111111] px-3 py-2 text-xs text-[#cccccc] disabled:opacity-60">Reject</button></div><p className="mt-2 text-xs text-[#777777]">Screenshots are not proof of settlement. Verify independently before confirming. Confirmation credits a verified deposit or debits a verified withdrawal exactly once.</p></form> : <p className="mt-2 whitespace-pre-wrap text-xs">{request.instructions}</p>}</article>)}{!visibleRequests.length && <p className="py-4 text-sm text-[#777777]">No requests yet.</p>}</div></div>
      </>}
    </section>
  )
}

export default AdminBuyers
