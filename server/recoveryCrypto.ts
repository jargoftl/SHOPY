import {randomBytes, createHash, createCipheriv, createDecipheriv} from 'node:crypto'
import {recoveryWords} from './recoveryWords.ts'

export const normalizePhrase = (value:string) => value.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ')
export const phraseHash = (value:string) => createHash('sha256').update(normalizePhrase(value)).digest('hex')
export function recoveryKey():Buffer {
  const key=process.env.RECOVERY_PHRASE_KEY||''
  if(!/^[a-f0-9]{64}$/i.test(key))throw new Error('Configure RECOVERY_PHRASE_KEY with a persistent 32-byte hex key.')
  return Buffer.from(key,'hex')
}
export function generatePhrase():string {
  const entropy=randomBytes(16)
  const bits=[...entropy].map(b=>b.toString(2).padStart(8,'0')).join('')+createHash('sha256').update(entropy).digest()[0]!.toString(2).padStart(8,'0').slice(0,4)
  return Array.from({length:12},(_,i)=>recoveryWords[parseInt(bits.slice(i*11,i*11+11),2)]).join(' ')
}
export function encryptPhrase(phrase:string,userId:number):string {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',recoveryKey(),iv)
  cipher.setAAD(Buffer.from(`seller-recovery:${userId}`))
  const ciphertext=Buffer.concat([cipher.update(phrase,'utf8'),cipher.final()])
  return [iv,cipher.getAuthTag(),ciphertext].map(b=>b.toString('base64')).join('.')
}
export function decryptPhrase(value:string,userId:number):string {
  const [iv,tag,body]=value.split('.').map(s=>Buffer.from(s,'base64'))
  const cipher=createDecipheriv('aes-256-gcm',recoveryKey(),iv!)
  cipher.setAAD(Buffer.from(`seller-recovery:${userId}`));cipher.setAuthTag(tag!)
  return Buffer.concat([cipher.update(body!),cipher.final()]).toString('utf8')
}
