import {test} from 'node:test'
import assert from 'node:assert/strict'
test('identity-only caching is scoped, expires, respects invalidation, and never caches balances',async()=>{
 const saved={fetch:globalThis.fetch,window:globalThis.window,sessionStorage:globalThis.sessionStorage,now:Date.now},storage=new Map();let clock=1000,calls=0,role='seller'
 globalThis.window={dispatchEvent(){}};globalThis.sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};Date.now=()=>clock
 globalThis.fetch=async(path)=>{calls++;return path==='/api/expired'?new Response('{"error":"Expired"}',{status:401}):new Response(JSON.stringify(path==='/api/auth/me'?{user:{id:calls,role}}:{balanceCents:calls}),{status:200})}
 try{
  const {apiRequest}=await import('../src/lib/api.js'),{setTabScope}=await import('../src/lib/tabSession.js')
  const first=await apiRequest('/api/auth/me');await apiRequest('/api/auth/me');assert.equal(calls,1)
  first.user.role='tampered';assert.equal((await apiRequest('/api/auth/me')).user.role,'seller')
  clock+=10001;await apiRequest('/api/auth/me');assert.equal(calls,2)
  await apiRequest('/api/rewards');await apiRequest('/api/rewards');assert.equal(calls,4)
  await apiRequest('/api/funding',{method:'POST',body:'{}'});role='customer';assert.equal((await apiRequest('/api/auth/me')).user.role,'customer');assert.equal(calls,6)
  await apiRequest('/api/auth/me',{cache:'no-store'});assert.equal(calls,7)
  setTabScope('a'.repeat(32));await apiRequest('/api/auth/me');assert.equal(calls,8)
  await assert.rejects(apiRequest('/api/expired'));await apiRequest('/api/auth/me');assert.equal(calls,10)
 }finally{globalThis.fetch=saved.fetch;globalThis.window=saved.window;globalThis.sessionStorage=saved.sessionStorage;Date.now=saved.now}
})
