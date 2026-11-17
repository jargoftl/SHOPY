import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto'
const key=()=>{const value=process.env.SSN_ENCRYPTION_KEY||'';if(!/^[a-fA-F0-9]{64}$/.test(value))throw new Error('SSN storage is not configured.');return Buffer.from(value,'hex')}
export const ssnStorageConfigured=()=>/^[a-fA-F0-9]{64}$/.test(process.env.SSN_ENCRYPTION_KEY||'')
export function prepareSellerSsn(value:unknown,country:unknown):{last4:string|null,encrypted:string|null}|{error:string}{
 if(value==null||value==='')return {last4:null,encrypted:null}
 if(country!=='United States'||typeof value!=='string'||!/^\d{9}$/.test(value))return {error:'Enter nine SSN digits or leave the field blank.'}
 if(!ssnStorageConfigured())return {error:'SSN storage is not configured. Leave this field blank to continue.'}
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv)
 const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()])
 return {last4:value.slice(-4),encrypted:[iv,cipher.getAuthTag(),encrypted].map(x=>x.toString('base64')).join('.')}
}
export function decryptSellerSsn(value:string):string{
 const [iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64')),cipher=createDecipheriv('aes-256-gcm',key(),iv)
 cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8')
}
