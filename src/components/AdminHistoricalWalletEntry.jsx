import UiverseSelect from './UiverseSelect.jsx'
import { useRef, useState } from 'react'
import { apiRequest } from '../lib/api.js'
import { parseAmountCents } from '../lib/money.js'

export default function AdminHistoricalWalletEntry({ sellerId }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const attempt = useRef(null)

  async function save(event) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const fields = new FormData(form)
    const effectiveAt = Date.parse(fields.get('effectiveAt') + '+01:00')
    const amountCents = parseAmountCents(fields.get('amount'))
    if (!Number.isFinite(effectiveAt) || !amountCents) {
      setResult({ error: true, text: 'Enter a valid amount, date and time.' })
      return
    }
    const entry = {
      kind: fields.get('kind'), amountCents,
      effectiveAt: new Date(effectiveAt).toISOString(), verified: fields.get('verified') === 'on',
    }
    const fingerprint = JSON.stringify(entry)
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() }
    setBusy(true)
    setResult(null)
    try {
      await apiRequest(`/api/admin/sellers/${sellerId}/wallet-records`, {
        method: 'POST', body: JSON.stringify({ ...entry, requestKey: attempt.current.key }),
      })
      attempt.current = null
      form.reset()
      setResult({ text: 'Wallet entry saved. It will appear under its recorded date in transaction history.' })
    } catch (error) {
      setResult({ error: true, text: error.message })
    } finally {
      setBusy(false)
    }
  }

  const field = 'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3'
  return <form onSubmit={save} className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900">
    <p className="text-sm text-slate-600">Record a past credit or withdrawal that hasn’t been entered. This changes the seller’s current wallet balance.</p>
    <fieldset disabled={busy} className="mt-3 grid gap-3 sm:grid-cols-3">
      <label className="text-sm">Entry type<UiverseSelect name="kind" className={field}><option value="credit">Credit</option><option value="withdrawal">Withdrawal</option></UiverseSelect></label>
      <label className="text-sm">Amount (USD)<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required className={field}/></label>
      <label className="text-sm">Transaction date and time (Lagos)<input name="effectiveAt" type="datetime-local" required className={field}/></label>
      <label className="flex items-start gap-2 text-sm sm:col-span-3"><input type="checkbox" name="verified" required/> I verified this entry and authorize the wallet adjustment.</label>
      <button className="min-h-11 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white">{busy?'Saving…':'Save wallet entry'}</button>
    </fieldset>
    {result&&<p role={result.error?'alert':'status'} className="mt-3 text-sm">{result.text}</p>}
  </form>
}
