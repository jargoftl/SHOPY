import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api.js'
import { formatMoney } from '../lib/money.js'

const RewardsBalance = () => {
  const [balance, setBalance] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const result = await apiRequest('/api/rewards', { background: true })
        if (active) { setBalance(result.balanceUnits); setError('') }
      } catch {
        if (active) setError('Balance unavailable.')
      }
    }
    refresh()
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [])

  return <section className="border border-[#e5e5e5] bg-white p-5 text-[#111111]">
    <h2 className="text-sm font-semibold">Balance · USD</h2>
    <p className="mt-2 text-2xl font-semibold">{balance === null ? '—' : formatMoney(balance)}</p>
    <p className="mt-1 text-xs text-[#555555]">Store credit for purchases; not withdrawable as cash.</p>
    {error && <p role="status" className="mt-2 text-xs text-[#a33]">{error}</p>}
  </section>
}

export default RewardsBalance