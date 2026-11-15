import {test} from 'node:test'
import assert from 'node:assert/strict'
test('concurrent GETs coalesce per tab but settled or mutation-invalidated balances are read again',async()=>{
 const saved={fetch:globalThis.fetch,window:globalThis.window,sessionStorage:globalThis.sessionStorage},store=new Map()
 globalThis.window={dispatchEvent(){}};globalThis.sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}
 const pending=[];let calls=0
 globalThis.fetch=async(_path,options)=>{if(options.method==='POST')return new Response('{"ok":true}',{status:200});calls++;return new Promise(resolve=>pending.push(()=>resolve(new Response(JSON.stringify({balance:calls}),{status:200}))))}
 try{
  const {apiRequest}=await import('../src/lib/api.js'),{setTabScope}=await import('../src/lib/tabSession.js')
  const a=apiRequest('/api/rewards'),b=apiRequest('/api/rewards');assert.equal(a,b);assert.equal(calls,1);pending.shift()();await a
  const c=apiRequest('/api/rewards');assert.notEqual(c,a);assert.equal(calls,2)
  await apiRequest('/api/test-mutation',{method:'POST',body:'{}'})
  const d=apiRequest('/api/rewards');assert.notEqual(c,d);assert.equal(calls,3)
  setTabScope('f'.repeat(32));const e=apiRequest('/api/rewards');assert.notEqual(d,e);assert.equal(calls,4)
  pending.splice(0).forEach(resolve=>resolve());await Promise.all([c,d,e])
 }finally{Object.assign(globalThis,saved)}
})
