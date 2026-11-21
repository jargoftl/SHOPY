export function timestampMillis(value){
 if(!value)return Infinity
 const timestamp=value.trim().replace(' ','T')
 const normalized=timestamp.includes('T') && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)
  ? /[+-]\d{2}$/.test(timestamp) ? timestamp+':00' : timestamp+'Z'
  : timestamp
 const time=Date.parse(normalized)
 return Number.isFinite(time)?time:Infinity
}
export function formatTimestamp(value){
 const time=timestampMillis(value)
 return Number.isFinite(time)?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'long',timeZone:'Africa/Lagos'}).format(time):'Not recorded'
}
export function formatStoreDate(value){
 if(!value)return ''
 const date=new Date(value.slice(0,10)+'T00:00:00Z')
 return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeZone:'UTC'}).format(date):''
}
export function establishedLabel(value,today=new Date().toISOString().slice(0,10)){
 if(!value)return ''
 return value>today?'Planned opening':'Store established'
}
