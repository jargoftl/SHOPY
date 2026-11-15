import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ObjectStorage } from '../dist-server/storage.js'
import { prepareVerificationPhotos, verificationPhone } from '../dist-server/sellerVerification.js'
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9kAAAAASUVORK5CYII=','base64')
test('verification photos require all three inputs and phone numbers normalize safely',()=>{
 const photo={type:'image/png',data:png.toString('base64')},body={verificationConsent:true,verificationPhotos:{selfie:photo,id_front:photo,id_back:photo}}
 assert.equal(prepareVerificationPhotos(body).photos.length,3)
 assert.ok(prepareVerificationPhotos({...body,verificationConsent:false}).error)
 assert.ok(prepareVerificationPhotos({...body,verificationPhotos:{selfie:photo,id_front:photo}}).error)
 assert.ok(prepareVerificationPhotos({...body,verificationPhotos:{...body.verificationPhotos,id_back:{type:'image/svg+xml',data:Buffer.from('<svg/>').toString('base64')}}}).error)
 assert.equal(verificationPhone('+234 (801) 234-5678'),'+2348012345678');assert.equal(verificationPhone('123'),null);assert.equal(verificationPhone('tel:5551234567'),null)
})
test('verification uploads refuse a public bucket and use a separate private prefix',async()=>{
 const oldFetch=globalThis.fetch,previous={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://storage.example.test',SUPABASE_SERVICE_ROLE_KEY:'test-only-key',SUPABASE_STORAGE_BUCKET:'shop-uploads'})
 let calls=[],publicBucket=true
 globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),options});return Response.json(String(url).includes('/bucket/')?{public:publicBucket}:{})}
 try{
  const storage=new ObjectStorage();await assert.rejects(storage.putVerification(png,'image/png'),/private/)
  assert.equal(calls.length,1);publicBucket=false;calls=[]
  const path=await storage.putVerification(png,'image/png');assert.match(path,/^verification\/[a-f0-9-]{36}\.png$/)
  assert.ok(calls[1].url.endsWith(path));assert.equal(calls[1].options.headers.Authorization,'Bearer test-only-key')
  await assert.rejects(storage.getVerification('images/not-private'),/Invalid/)
  await storage.deleteVerification(path);assert.deepEqual(JSON.parse(calls.at(-1).options.body),{prefixes:[path]})
 }finally{globalThis.fetch=oldFetch;for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_STORAGE_BUCKET']){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}}
})

test('optional SSN reference accepts only four digits for US applicants and never a full SSN',async()=>{
 const {optionalSsnLast4}=await import('../dist-server/sellerVerification.js')
 for(const country of ['United States','Nigeria'])for(const value of [undefined,null,''])assert.deepEqual(optionalSsnLast4(value,country),{value:null})
 assert.deepEqual(optionalSsnLast4('0001','United States'),{value:'0001'})
 for(const value of ['000000001','123-45-6789','123','12345',1234,{},'abcd','1234\n'])assert.ok(optionalSsnLast4(value,'United States').error)
 assert.ok(optionalSsnLast4('0001','Nigeria').error)
})
