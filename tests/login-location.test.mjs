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
