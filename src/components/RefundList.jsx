import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api.js'

export default function RefundList({ admin = false }) {
  const [refunds, setRefunds] = useState([])
  const [message, setMessage] = useState('')
  const [references, setReferences] = useState({})
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const load = async () => { const data = await apiRequest(admin ? '/api/admin/refunds' : '/api/seller/refunds'); setRefunds(data.refunds) }
  useEffect(() => {
    let active = true
    apiRequest(admin ? '/api/admin/refunds' : '/api/seller/refunds').then((data) => { if (active) { setRefunds(data.refunds); setLoaded(true) } }).catch((error) => { if (active) setMessage(error.message) })
    return () => { active = false }
  }, [admin])
  const update = async (refund, status) => {
    setBusy(true); setMessage('')
    try {
      const path = admin ? `/api/admin/refunds/${refund.id}/complete` : `/api/seller/refunds/${refund.id}`
      const body = admin ? { verified: true, transferReference: references[refund.id] } : { status }
      if (admin && !window.confirm('Have you independently completed this manual transfer? This does not send money.')) return
      await apiRequest(path, { method: 'PATCH', body: JSON.stringify(body) }); await load(); setMessage('Refund request updated.')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  return <section id="refunds" className={admin ? 'mb-8 rounded-xl border border-[#263c2d] bg-[#0d1b12] p-5 sm:p-7' : 'rounded-xl border border-[#e1e7df] bg-white p-5'}>
    <h2 className="text-lg font-semibold">Refund requests</h2><p className="mt-1 text-sm">Seller approval does not send money. The administrator must arrange and independently confirm any refund manually.</p>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    <div className="mt-4 space-y-3">{refunds.map((r) => <article key={r.id} className="rounded border border-[#9ba99c] p-4 text-sm"><p className="font-semibold">Order #{r.orderNumber} · {r.storeName} · {r.status}</p><p className="mt-2">{r.items}</p><p className="mt-2">Reason: {r.reason}</p>{r.transferReference && <p className="mt-2">Recorded transfer reference: {r.transferReference}</p>}
      {!admin && r.status === 'pending' && <div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => update(r, 'approved')} className="rounded bg-[#315941] px-3 py-2 text-white">Approve</button><button disabled={busy} onClick={() => update(r, 'rejected')} className="rounded border border-[#9ba99c] px-3 py-2">Reject</button></div>}
      {admin && r.status === 'approved' && <div className="mt-3 flex flex-wrap gap-2"><label>Manual transfer reference <input value={references[r.id] || ''} onChange={(e) => setReferences({ ...references, [r.id]: e.target.value })} maxLength={500} className="rounded border border-[#9ba99c] bg-transparent p-2" /></label><button disabled={busy || !references[r.id]?.trim()} onClick={() => update(r)} className="rounded bg-[#c8f135] px-3 py-2 text-[#102016] disabled:opacity-50">Record completed transfer</button></div>}
    </article>)}{loaded && !refunds.length && <p className="text-sm">No refund requests yet.</p>}</div>
  </section>
}
