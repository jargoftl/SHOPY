import { useId, useState } from 'react'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'

// Optional administrator reference; this is not an identity-verification service.
export function sellerSsnSuffix(value) {
  if (!value) return null
  return /^[0-9]{9}$/.test(value) ? value : null
}
export default function OptionalSellerSsn({value,onChange}) {
  const id=useId(),[visible,setVisible]=useState(false)
  return <div className="rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-4">
    <label htmlFor={id} className="block text-xs font-medium text-[#111111]">Social Security number</label>
    <div className="relative mt-2"><input id={id} name="optionalSsn" type={visible?'text':'password'} inputMode="numeric" autoComplete="off" pattern="[0-9]{9}" minLength={9} maxLength={9} value={value} onChange={event=>onChange(event.target.value.replace(/[^0-9]/g,'').slice(0,9))} aria-describedby={`${id}-help`} placeholder="9 digits" className="min-h-12 w-full rounded-lg border border-[#e5e5e5] bg-white px-3 pr-12 text-sm"/><button type="button" onClick={()=>setVisible(current=>!current)} aria-label={visible?'Hide SSN':'Show SSN'} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#555555]">{visible?<EyeOff size={16}/>:<Eye size={16}/>}</button></div>
    <p id={`${id}-help`} className="mt-2 flex items-start gap-2 text-[11px] leading-6 text-[#555555]"><ShieldCheck size={14} className="mt-1 shrink-0"/><span>If provided, your nine-digit SSN is encrypted and can be viewed by support team for application review. It is not automatically verified and does not replace government-ID review.</span></p>
  </div>
}
