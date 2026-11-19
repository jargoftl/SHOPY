import {isIP} from 'node:net'
import type {Request} from 'express'
import type {Database} from './database.ts'
const clean=(value:string|undefined)=>{try{return decodeURIComponent(value||'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,100)}catch{return ''}}
const networkIp=(value:string)=>{let ip=value.split(',')[0].trim().replace(/^::ffff:/,'');if(ip.startsWith('['))ip=ip.slice(1,ip.indexOf(']'));if(!isIP(ip)&&/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip))ip=ip.split(':')[0];return isIP(ip)?ip:''}
export function loginLocation(req:Pick<Request,'ip'|'get'>){
 const ip=[req.get('x-vercel-forwarded-for'),req.get('x-real-ip'),req.ip].map(value=>networkIp(value||'')).find(Boolean)||''
 const country=clean(req.get('x-vercel-ip-country')),region=clean(req.get('x-vercel-ip-country-region')),city=clean(req.get('x-vercel-ip-city'))
 return {ip,location:[city,region,country].filter(Boolean).join(', '),source:city||region||country?'proxy-reported, approximate':'unavailable'}
}
const publicIp=(ip:string)=>{
 if(isIP(ip)===6)return /^[23]/i.test(ip)&&!ip.toLowerCase().startsWith('2001:db8:')
 if(isIP(ip)!==4)return false
 const [a,b,c]=ip.split('.').map(Number)
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113)
}
const cache=new Map<string,{location:string,time:number}>(),inFlight=new Map<string,Promise<string>>()
async function locate(ip:string){
 const cached=cache.get(ip);if(cached&&Date.now()-cached.time<(cached.location?30*60*1000:60000))return cached.location
 if(inFlight.has(ip))return inFlight.get(ip)!
 const pending=(async()=>{let location='';try{const response=await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`,{signal:AbortSignal.timeout(2500)});if(response.ok){const data=await response.json() as {success?:boolean,city?:string,region?:string,country?:string};if(data.success===true)location=[data.city,data.region,data.country].filter(v=>typeof v==='string'&&v).map(v=>clean(v)).filter((v,i,a)=>a.indexOf(v)===i).join(', ')}}catch{/* Keep the recorded IP when geolocation is unavailable. */}if(cache.size>=1000)cache.delete(cache.keys().next().value!);cache.set(ip,{location,time:Date.now()});return location})()
 inFlight.set(ip,pending);try{return await pending}finally{inFlight.delete(ip)}
}
// No GPS or exact address is inferred. Hosting metadata and IP results are approximate.
export async function enrichLoginLocation(db:Database,eventId:number,record:{ip:string,location:string}){
 if(!eventId||record.location||!publicIp(record.ip)||process.env.LOGIN_IP_GEOLOCATION==='disabled')return
 const location=await locate(record.ip)
 if(location)await db.prepare("UPDATE auth_events SET location=?,location_source='IP lookup, approximate' WHERE id=? AND location=''").run(location,eventId)
}
