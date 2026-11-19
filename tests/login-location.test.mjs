import test from 'node:test'
import assert from 'node:assert/strict'
import {loginLocation} from '../dist-server/loginLocation.js'
const request=(ip,headers={})=>({ip,get:name=>headers[name]})
test('login location records valid network IP and explicitly unknown location',()=>{
 assert.deepEqual(loginLocation(request('::ffff:127.0.0.1')),{ip:'127.0.0.1',location:'',source:'unavailable'})
 assert.equal(loginLocation(request('not-an-ip')).ip,'')
})
test('hosting location is decoded, bounded, and labeled approximate rather than verified',()=>{
 const result=loginLocation(request('2001:db8::1',{'x-vercel-ip-city':'New%20York','x-vercel-ip-country-region':'NY','x-vercel-ip-country':'US'}))
 assert.equal(result.location,'New York, NY, US');assert.equal(result.source,'proxy-reported, approximate')
 assert.ok(loginLocation(request('',{'x-vercel-ip-city':'x'.repeat(500)})).location.length<=100)
 assert.equal(loginLocation(request('',{'x-vercel-ip-city':'%zz'})).location,'')
})
test('Vercel client addresses support ports and forwarded chains',()=>{
 assert.equal(loginLocation(request('127.0.0.1',{'x-vercel-forwarded-for':'8.8.8.8:443, 1.1.1.1'})).ip,'8.8.8.8')
 assert.equal(loginLocation(request('127.0.0.1',{'x-real-ip':'[2001:db8::2]:443'})).ip,'2001:db8::2')
})
test('IP lookup fills missing city/country asynchronously without exposing credentials',async()=>{
 const {enrichLoginLocation}=await import('../dist-server/loginLocation.js'),original=globalThis.fetch,setting=process.env.LOGIN_IP_GEOLOCATION
 delete process.env.LOGIN_IP_GEOLOCATION
 let saved
 globalThis.fetch=async url=>{assert.equal(String(url),'https://ipwho.is/8.8.4.4');return new Response(JSON.stringify({success:true,city:'Example city',region:'Example region',country:'Example country'}),{status:200})}
 try{await enrichLoginLocation({prepare:()=>({run:async(...values)=>{saved=values}})},42,{ip:'8.8.4.4',location:''});assert.deepEqual(saved,['Example city, Example region, Example country',42])}finally{globalThis.fetch=original;if(setting===undefined)delete process.env.LOGIN_IP_GEOLOCATION;else process.env.LOGIN_IP_GEOLOCATION=setting}
})
