import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {prepareSellerSsn,decryptSellerSsn} from '../dist-server/sellerSsn.js'
test('SSN storage is optional, encrypted, authenticated and configuration gated',()=>{
 delete process.env.SSN_ENCRYPTION_KEY
 assert.deepEqual(prepareSellerSsn('', 'United States'),{last4:null,encrypted:null})
 assert.ok(prepareSellerSsn('000000000','United States').error)
 process.env.SSN_ENCRYPTION_KEY=randomBytes(32).toString('hex')
 assert.ok(prepareSellerSsn('1234','United States').error)
 assert.ok(prepareSellerSsn('000000000','Canada').error)
 const result=prepareSellerSsn('000000000','United States')
 assert.equal(result.last4,'0000');assert.ok(!result.encrypted.includes('000000000'))
 assert.equal(decryptSellerSsn(result.encrypted),'000000000')
 assert.notEqual(result.encrypted,prepareSellerSsn('000000000','United States').encrypted)
 const parts=result.encrypted.split('.');const tag=Buffer.from(parts[1],'base64');tag[0]^=1;parts[1]=tag.toString('base64')
 assert.throws(()=>decryptSellerSsn(parts.join('.')))
 process.env.SSN_ENCRYPTION_KEY=randomBytes(32).toString('hex')
 assert.throws(()=>decryptSellerSsn(result.encrypted))
 delete process.env.SSN_ENCRYPTION_KEY
})
