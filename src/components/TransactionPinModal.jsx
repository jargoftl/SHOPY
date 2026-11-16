import {useEffect,useRef,useState} from 'react'
import {X} from 'lucide-react'
import TransactionPinSettings from './TransactionPinSettings.jsx'
export default function TransactionPinModal({open,onClose,onSaved}){
 const dialog=useRef(null),[busy,setBusy]=useState(false),returnFocus=useRef(null)
 useEffect(()=>{const node=dialog.current;if(open){returnFocus.current=document.activeElement;if(!node.open)node.showModal()}else if(node.open){node.close();returnFocus.current?.focus?.()}return()=>{if(node.open)node.close()}},[open])
 return <dialog ref={dialog} aria-labelledby="pin-modal-title" onCancel={e=>{e.preventDefault();if(!busy)onClose()}} className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border-0 bg-white p-5 text-black shadow-2xl backdrop:bg-black/50 sm:p-7"><div className="mb-4 flex items-center justify-between gap-3"><h2 id="pin-modal-title" className="text-lg font-semibold">Wallet PIN security</h2><button type="button" aria-label="Close PIN setup" disabled={busy} onClick={onClose} className="rounded-full p-2 disabled:opacity-40"><X size={20}/></button></div>{open&&<TransactionPinSettings onBusyChange={setBusy} onSaved={async()=>{await onSaved?.();onClose()}}/>}</dialog>
}
