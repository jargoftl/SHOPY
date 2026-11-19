import { useEffect, useRef, useState } from 'react'
import { IoCopyOutline } from 'react-icons/io5'

const WalletModal = ({ request, onClose }) => {
  const dialog = useRef(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => { if (element.open) element.close() }
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(request.walletAddress)
      setMessage('Wallet address copied.')
    } catch {
      setMessage('Could not copy the address. Select and copy it manually.')
    }
  }

  return <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose() }} aria-labelledby="wallet-modal-title" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-[#e5e5e5] bg-white p-6 text-[#111111] shadow-xl backdrop:bg-black/50">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#111111]">Deposit request #{request.id}</p><h2 id="wallet-modal-title" className="mt-2 text-xl font-semibold">Wallet details from the support</h2></div><button type="button" onClick={onClose} aria-label="Close wallet details" className="text-xl leading-none">×</button></div>
    <p className="mt-4 text-sm">Accepted coin: <strong>{request.paymentCoin}</strong> · Network: <strong>{request.network}</strong></p>
    <div className="mt-3 flex items-center gap-3 rounded border border-[#e5e5e5] bg-[#f7f7f7] p-3"><span className="min-w-0 flex-1 break-all font-mono text-sm">{request.walletAddress}</span><button type="button" onClick={copy} aria-label="Copy wallet address" title="Copy wallet address" className="grid size-10 shrink-0 place-items-center rounded border border-[#cccccc] hover:border-[#111111]"><IoCopyOutline size={20} /></button></div>
    {message && <p role="status" className="mt-2 text-sm text-[#111111]">{message}</p>}
    {request.instructions && <p className="mt-3 whitespace-pre-wrap text-sm text-[#111111]">{request.instructions}</p>}
    <p className="mt-4 text-xs leading-5 text-[#555555]">Check the coin and network before paying. This site does not process or verify transfers. Enter the amount on your profile and submit a receipt for manual review.</p>
    <button type="button" onClick={onClose} className="mt-5 bg-[#111111] px-4 py-2 text-sm text-white">Continue</button>
  </dialog>
}

export default WalletModal
