import {CalendarDays} from 'lucide-react'
import {formatStoreDate,establishedLabel} from '../lib/storeDates.js'
export default function StoreDates({storeCreatedAt,establishedOn}){
 const value=establishedOn||storeCreatedAt
 if(!value)return null
 const label=establishedOn?establishedLabel(establishedOn):'On this platform since'
 return <section aria-label="Store date" className="mt-5 inline-flex max-w-full items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 text-black shadow-sm"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-100" aria-hidden="true"><CalendarDays size={21}/></span><div className="min-w-0"><p className="text-xs font-medium text-gray-600">{label}</p><time dateTime={value.slice(0,10)} className="mt-1 block text-lg font-semibold leading-7 sm:text-xl">{formatStoreDate(value)}</time>{establishedOn&&<p className="mt-1 text-[10px] leading-4 text-gray-500">Business date provided by administrator</p>}</div></section>
}
