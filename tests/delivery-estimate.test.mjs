import {test} from 'node:test'
import assert from 'node:assert/strict'
import {deliveryEstimate} from '../src/lib/deliveryEstimate.js'
test('three-day estimates advance without claiming confirmed delivery',()=>{
 const start='2026-11-15 00:00:00',base=Date.parse('2026-11-15T00:00:00Z')
 for(const [hours,stage] of [[0,0],[1,1],[23,1],[24,2],[71,2],[72,3],[100,3]]){
 const result=deliveryEstimate(start,base+hours*3600000)
 assert.equal(result.stage,stage);assert.notEqual(result.status,'delivered')
 }
 assert.equal(deliveryEstimate('invalid'),null)
})
