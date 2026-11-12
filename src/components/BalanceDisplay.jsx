import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { formatMoney } from '../lib/money.js'

const BalanceDisplay = ({ balanceCents, size = 'text-2xl' }) => {
  const [visible, setVisible] = useState(true)

  return <div>
    <div className="flex items-center gap-2">
      <p className="text-xs text-white/75">Balance · USD</p>
      <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Hide balance' : 'Show balance'} aria-pressed={!visible} title={visible ? 'Hide balance' : 'Show balance'} className="rounded p-1 text-white/75 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
        {visible ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />}
      </button>
    </div>
    <p className={`mt-1 font-semibold ${size}`}>{visible ? formatMoney(balanceCents) : <span aria-label="Balance hidden">••••••</span>}</p>
    <p className="mt-2 text-xs text-white/75">Test balance; not spendable.</p>
  </div>
}

export default BalanceDisplay
