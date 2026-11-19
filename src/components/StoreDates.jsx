import {formatStoreDate,establishedLabel} from '../lib/storeDates.js'
export default function StoreDates({storeCreatedAt,establishedOn}){
 if(!storeCreatedAt&&!establishedOn)return null
 return <div className="mt-4 space-y-1 text-xs leading-6"><p>On this platform since {formatStoreDate(storeCreatedAt)}</p>{establishedOn&&<p>{establishedLabel(establishedOn)}: {formatStoreDate(establishedOn)} <span>(admin-provided business date)</span></p>}</div>
}
