import {isIP} from 'node:net'
import type {Request} from 'express'
const clean=(value:string|undefined)=>{try{return decodeURIComponent(value||'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,100)}catch{return ''}}
// Proxy-reported metadata is informational, never an identity or access-control check.
export function loginLocation(req:Pick<Request,'ip'|'get'>){
 const ip=String(req.ip||'').replace(/^::ffff:/,'')
 const country=clean(req.get('x-vercel-ip-country'))
 const region=clean(req.get('x-vercel-ip-country-region'))
 const city=clean(req.get('x-vercel-ip-city'))
 return {ip:isIP(ip)?ip:'',location:[city,region,country].filter(Boolean).join(', '),source:city||region||country?'proxy-reported, approximate':'unavailable'}
}
