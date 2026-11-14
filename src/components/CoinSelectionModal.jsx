import { useEffect, useRef } from 'react'
import { coinDetails } from '../lib/coins.js'

const CoinSelectionModal = ({ selected, onSelect, onClose, availableCoins }) => {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [])
  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose() }} aria-labelledby="coin-selection-title" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-[#dfe3dd] bg-white p-6 text-[#19231b] shadow-xl backdrop:bg-black/50">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#526055]">Manual payment</p><h2 id="coin-selection-title" className="mt-2 text-xl font-semibold">Choose a coin</h2></div><button type="button" onClick={onClose} aria-label="Close coin selection" className="text-xl leading-none">×</button></div>
    <p className="mt-3 text-sm text-[#526055]">Choose a configured coin to see the wallet and final amount. Unavailable coins have not been set up by the administrator.</p>
    <div className="mt-4 grid max-h-80 gap-1 overflow-y-auto">{Object.entries(coinDetails).map(([code, [name, symbol, color]]) => <button key={code} type="button" disabled={!availableCoins.includes(code)} onClick={() => onSelect(code)} aria-pressed={selected === code} className={`flex items-center gap-3 rounded border px-3 py-3 text-left text-sm hover:bg-[#f1f5ef] disabled:cursor-not-allowed disabled:opacity-50 ${selected === code ? 'border-[#315941] bg-[#f1f5ef]' : 'border-[#dfe3dd]'}`}><span style={{ backgroundColor: color }} className="grid size-8 shrink-0 place-items-center rounded-full font-bold text-white" aria-hidden="true">{symbol}</span><span className="flex-1">{name} ({code})</span>{!availableCoins.includes(code) ? <span className="text-xs">Unavailable</span> : selected === code && <span className="text-xs font-semibold text-[#315941]">Selected</span>}</button>)}</div>
  </dialog>
}

export default CoinSelectionModal
