import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {generatePhrase,encryptPhrase,decryptPhrase,phraseHash} from '../dist-server/recoveryCrypto.js'
test('random phrases, normalization, authenticated encryption and account binding',()=>{
 process.env.RECOVERY_PHRASE_KEY=randomBytes(32).toString('hex')
 const phrase=generatePhrase(),encrypted=encryptPhrase(phrase,42)
 assert.equal(phrase.split(' ').length,12)
 assert.notEqual(phrase,generatePhrase())
 assert.equal(decryptPhrase(encrypted,42),phrase)
 assert.equal(phraseHash(phrase.toUpperCase().replaceAll(' ','  ')),phraseHash(phrase))
 assert.throws(()=>decryptPhrase(encrypted,43))
 process.env.RECOVERY_PHRASE_KEY=randomBytes(32).toString('hex')
 assert.throws(()=>decryptPhrase(encrypted,42))
 delete process.env.RECOVERY_PHRASE_KEY
 assert.throws(()=>encryptPhrase(phrase,42))
})
