import { useId, useState } from 'react'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'

// Optional administrator reference; this is not an identity-verification service.
export function sellerSsnSuffix(value) {
  if (!value) return null
  return /^[0-9]{4}$/.test(value) ? value : null
}
export default function OptionalSellerSsn({value,onChange}) {
  const id=useId(),[visible,setVisible]=useState(false)
  return <div className="rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-4">
    <label htmlFor={id} className="block text-xs font-medium text-[#111111]">SSN reference — last four digits <span className="font-normal">(optional)</span></label>
    <div className="relative mt-2"><input id={id} name="optionalSsn" type={visible?'text':'password'} inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" minLength={4} maxLength={4} value={value} onChange={event=>onChange(event.target.value.replace(/[^0-9]/g,'').slice(0,4))} aria-describedby={`${id}-help`} placeholder="Last 4 digits · optional" className="min-h-12 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 pr-12 text-sm"/><button type="button" onClick={()=>setVisible(current=>!current)} aria-label={visible?'Hide SSN':'Show SSN'} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#555555]">{visible?<EyeOff size={16}/>:<Eye size={16}/>}</button></div>
    <p id={`${id}-help`} className="mt-2 flex items-start gap-2 text-[11px] leading-6 text-[#555555]"><ShieldCheck size={14} className="mt-1 shrink-0"/><span>Optional, unverified reference for the administrator. Enter only the last four digits. This is not an SSN check and does not replace the required government-ID review.</span></p>
  </div>
}
