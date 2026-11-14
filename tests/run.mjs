import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const originalCwd=process.cwd();
let db=new PGlite();
await db.waitReady;
const query=async(sql,params=[])=>{
 if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:0};
 try{
  if(!params.length && sql.includes(';')){await db.exec(sql);return {rows:[],rowCount:0}}
  const result=await db.query(sql,params);return {rows:result.rows,rowCount:result.affectedRows||result.rows.length};
 }catch(e){if(e.code!=='23505')console.error('SQL FAILED:',sql,'CODE:',e.code);throw e}
};
pg.Pool.prototype.query=query;
pg.Pool.prototype.connect=async()=>({query,release(){}});
pg.Pool.prototype.end=async()=>{};
Object.assign(process.env,{DATABASE_URL:'postgresql://test:test@localhost/test',PORT:'4311',NODE_ENV:'production',ADMIN_EMAIL:'admin@example.test',ADMIN_PASSWORD:'long-test-password-123',SMTP_HOST:'',SMTP_PORT:'',SMTP_USER:'',SMTP_PASSWORD:'',BREVO_API_KEY:'',EMAIL_FROM:''});
const { ObjectStorage } = await import('../dist-server/storage.js');
const realPut=ObjectStorage.prototype.put,realGet=ObjectStorage.prototype.get,realVerify=ObjectStorage.prototype.verifyBucket;
ObjectStorage.prototype.verifyBucket=async()=>{};
const objects=new Map();
ObjectStorage.prototype.put=async(bytes)=>{const key='images/'+createHash('sha256').update(bytes).digest('hex');objects.set(key,bytes);return key};
ObjectStorage.prototype.get=async(key)=>{if(!objects.has(key))throw new Error('Object missing');return objects.get(key)};
const {httpServer}=await import('../dist-server/index.js');
const base='http://127.0.0.1:4311';
async function req(path,options={},cookie){const res=await fetch(base+path,{...options,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...options.headers}});const txt=await res.text();let data;try{data=JSON.parse(txt)}catch{data=txt}return {status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0]};}
let failures=0,checks=0;
function check(name,condition,detail=''){checks++;if(!condition){failures++;console.error('FAIL',name,detail)}else console.log('PASS',name)}
try{
 let r=await req('/api/site-settings');check('public settings',r.status===200&&r.data.siteName==='GGU',r);
 r=await req('/api/auth/login',{method:'POST',body:JSON.stringify({email:'admin@example.test',password:'long-test-password-123'})});

 const cookie=r.cookie;check('admin login',r.status===200&&cookie,r);
 for(const path of ['/api/admin/users','/api/admin/buyers','/api/admin/sellers','/api/admin/products','/api/admin/events','/api/admin/refunds','/api/admin/payment-wallets','/api/warehouse','/api/products','/api/categories']){
  r=await req(path,{},cookie);check(path,r.status===200,r);
 }
 r=await req('/');check('built frontend served',r.status===200&&String(r.data).includes('<html'),r.status);
 const routes=[...readFileSync('server/index.ts','utf8').matchAll(/app\.get\('([^']+)'/g),...readFileSync('server/manualOrders.ts','utf8').matchAll(/app\.get\('([^']+)'/g)].map(x=>x[1]);
 for(const path of new Set(routes.filter(x=>x.startsWith('/api/')))){
  r=await req(path.replace(/:[a-zA-Z]+/g,'1'),{},cookie);check('GET smoke '+path,r.status<500,r);
 }
 // Populate roles and exercise state changes and response types.
 const passwordHash=(await db.query("SELECT password_hash FROM shop.users WHERE role='admin'")).rows[0].password_hash;
 const sellerId=(await db.query("INSERT INTO shop.users (full_name,email,password_hash,role) VALUES ('Seller','seller@example.test',$1,'seller') RETURNING id",[passwordHash])).rows[0].id;
 await db.query("INSERT INTO shop.seller_profiles (user_id,store_name,country,address,city,region,postal_code) VALUES ($1,'Test Shop','Test','Test','Test','Test','123')",[sellerId]);
 const seller=(await req('/api/auth/login',{method:'POST',body:JSON.stringify({email:'seller@example.test',password:'long-test-password-123'})})).cookie;
 r=await req('/api/auth/register',{method:'POST',body:JSON.stringify({fullName:'Buyer',email:'buyer@example.test',password:'long-test-password-123'})});
 check('buyer registration',r.status===201,r);const buyer=r.cookie,buyerId=r.data.user?.id;
 r=await req('/api/auth/register',{method:'POST',body:JSON.stringify({fullName:'Duplicate',email:'buyer@example.test',password:'long-test-password-123'})});check('duplicate email is 409',r.status===409,r);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9kAAAAASUVORK5CYII=','base64');
 r=await req('/api/seller/products',{method:'POST',body:JSON.stringify({name:'Test product',category:'Bags',price:10,description:'Test',imageUploads:{primary:{type:'image/png',data:png.toString('base64')}},stockQuantity:5})},seller);
 check('product creation with Storage upload',r.status===201,r);const product=r.data.product;
 if(product){
  const image=await fetch(base+product.imageUrl);check('existing product image URL returns original bytes',image.ok&&Buffer.from(await image.arrayBuffer()).equals(png));
  check('database stores an object path, not image bytes',typeof (await db.query('SELECT image FROM shop.product_images')).rows[0].image==='string');
  const body={billing:{fullName:'Buyer',email:'buyer@example.test',phone:'123',address:'Test',city:'Test',region:'Test',postalCode:'123',country:'Test'},coin:'BALANCE',requestKey:'11111111-1111-1111-1111-111111111111',expectedTotalCents:1030,items:[{id:product.id,quantity:1,selectedColor:'',selectedSize:''}]};
  await db.query('INSERT INTO shop.reward_balances (user_id,balance_units) VALUES ($1,5000)',[buyerId]);
  r=await req('/api/purchases',{method:'POST',body:JSON.stringify(body)},buyer);check('balance purchase',r.status===201,r);const orderId=r.data.id;
  r=await req('/api/purchases',{method:'POST',body:JSON.stringify(body)},buyer);check('idempotent purchase retry',r.status===200&&r.data.id===orderId,r);
  check('balance debited once',Number((await db.query('SELECT balance_units FROM shop.reward_balances WHERE user_id=$1',[buyerId])).rows[0].balance_units)===3970);
  for(const [path,userCookie] of [['/api/purchases',buyer],['/api/purchases/'+orderId,buyer],['/api/admin/purchases',cookie],['/api/seller/purchases',seller],['/api/stores/'+sellerId,buyer],['/api/stores/'+sellerId,buyer],['/api/admin/users/'+buyerId+'/details',cookie],['/api/admin/users/'+sellerId+'/details',cookie]]){
   r=await req(path,{},userCookie);check('populated '+path,r.status===200,r);check('no serialized Promise placeholders '+path,!JSON.stringify(r.data).includes('"receipts":{}'),r);
  }
  r=await req('/api/admin/payment-wallets/USDT',{method:'PUT',body:JSON.stringify({network:'Test',address:'test-address',usdRate:'1'})},cookie);check('wallet configuration',r.status===200,r);
  body.coin='USDT';body.requestKey='22222222-2222-2222-2222-222222222222';delete body.expectedTotalCents;
  r=await req('/api/purchases',{method:'POST',body:JSON.stringify(body)},buyer);check('crypto purchase',r.status===201,r);const cryptoId=r.data.id;
  r=await req('/api/purchases/'+cryptoId+'/receipt',{method:'POST',headers:{'Content-Type':'image/png'},body:png},buyer);check('private receipt upload',r.status===201,r);
  const receipt=(await db.query('SELECT id FROM shop.purchase_receipts')).rows[0];
  if(receipt){
   let res=await fetch(base+'/api/admin/purchase-receipts/'+receipt.id,{headers:{Cookie:cookie}});check('admin downloads original private receipt',res.status===200&&Buffer.from(await res.arrayBuffer()).equals(png));
   res=await fetch(base+'/api/admin/purchase-receipts/'+receipt.id,{headers:{Cookie:buyer}});check('buyer denied private admin receipt',res.status===403);
  }
  // Insufficient balance must leave every financial/order table unchanged.
  await db.query('UPDATE shop.reward_balances SET balance_units=0 WHERE user_id=$1',[buyerId]);
  body.coin='BALANCE';body.expectedTotalCents=1030;body.requestKey='33333333-3333-3333-3333-333333333333';
  const before=Number((await db.query('SELECT COUNT(*) AS count FROM shop.purchase_orders')).rows[0].count);
  r=await req('/api/purchases',{method:'POST',body:JSON.stringify(body)},buyer);check('insufficient funds rejected',r.status===409,r);
  check('failed purchase creates no order',Number((await db.query('SELECT COUNT(*) AS count FROM shop.purchase_orders')).rows[0].count)===before);
 }
 r=await req('/api/admin/users/'+buyerId+'/rewards',{method:'PATCH',body:JSON.stringify({adjustmentUnits:9000000000,reason:'64-bit compatibility test'})},cookie);check('balances above PostgreSQL int32 range',r.status===200,r);
 // Existing GETs with populated users, orders and private images.
 for(const [userCookie,label] of [[cookie,'admin'],[buyer,'buyer'],[seller,'seller']])for(const path of new Set(routes.filter(x=>x.startsWith('/api/')))){
  r=await req(path.replace(/:sellerId/g,String(sellerId)).replace(/:[a-zA-Z]+/g,String(buyerId)),{},userCookie);check(label+' GET '+path,r.status<500,r);
 }
 // Verify actual Storage HTTP contracts with mocked responses and no live credentials.
 const storageFetch=globalThis.fetch;
 Object.assign(process.env,{SUPABASE_URL:'https://storage.example.test',SUPABASE_SERVICE_ROLE_KEY:'test-only-placeholder',SUPABASE_STORAGE_BUCKET:'shop-uploads'});
 try{
  const store=new ObjectStorage();let capture;
  globalThis.fetch=async(url,options)=>{capture={url,options};return new Response('{}',{status:200})};
  const bytes=Buffer.from('test bytes');const key=await realPut.call(store,bytes,'image/png');
  check('Storage uses authenticated upload endpoint',capture.url==='https://storage.example.test/storage/v1/object/shop-uploads/'+key&&capture.options.headers.Authorization==='Bearer test-only-placeholder');
  check('Storage key uses content hash',key==='images/'+createHash('sha256').update(bytes).digest('hex'));
  globalThis.fetch=async()=>new Response(bytes,{status:200});check('Storage authenticated download bytes',(await realGet.call(store,key)).equals(bytes));
  globalThis.fetch=async()=>new Response('{"public":true}',{status:200});let denied=false;try{await realVerify.call(store)}catch{denied=true}check('public receipt bucket rejected',denied);
  globalThis.fetch=async()=>new Response('{"public":false}',{status:200});await realVerify.call(store);check('private bucket accepted',true);
  globalThis.fetch=async()=>new Response('{"statusCode":"409"}',{status:409});check('immutable upload retry reuses object',await realPut.call(store,bytes,'image/png')===key);
 }finally{globalThis.fetch=storageFetch;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.SUPABASE_STORAGE_BUCKET}
 // Verify HTTPS email requests without contacting an external provider.
 const realFetch=globalThis.fetch;let sent;
 process.env.BREVO_API_KEY='test-only-placeholder';process.env.EMAIL_FROM='Test Shop <sender@example.test>';
 try{
  globalThis.fetch=async(url,options)=>{sent={url,options,body:JSON.parse(options.body)};return new Response('{}',{status:201})};
  const email=await import('../dist-server/email.js');
  check('HTTPS email configuration',email.isEmailConfigured());
  check('seller code email',await email.sendSellerVerificationCode({to:'seller@example.test',name:'Seller',code:'123456',siteName:'Shop'}));
  check('HTTPS email uses backend header and existing template',sent.url==='https://api.brevo.com/v3/smtp/email'&&sent.options.headers['api-key']==='test-only-placeholder'&&sent.body.textContent.includes('123456')&&sent.body.sender.email==='sender@example.test');
 }finally{globalThis.fetch=realFetch;delete process.env.BREVO_API_KEY;delete process.env.EMAIL_FROM}
 // The migration itself runs against a separate, empty PostgreSQL engine.
 const liveDb=db;db=new PGlite();await db.waitReady;
 const temporary=mkdtempSync(join(tmpdir(),'shopy-migration-test-'));
 try{
  const sourcePath=join(temporary,'original.db');const source=new DatabaseSync(sourcePath);
  source.exec(readFileSync('tests/fixtures/sqlite-schema.sql','utf8'));
  source.prepare("INSERT INTO users (id,full_name,email,password_hash,role) VALUES (42,'Preserved','preserved@example.test',?,'customer')").run(passwordHash);
  source.prepare('INSERT INTO reward_balances (user_id,balance_units) VALUES (42,12345)').run();
  source.prepare("INSERT INTO products (id,name,category,price,image_url) VALUES (101,'Original','Bags',10,'/api/product-images/original')").run();
  source.prepare("INSERT INTO product_images (id,content_type,image) VALUES ('original','image/png',?)").run(png);
  source.close();const originalDigest=createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
  process.chdir(temporary);
  const { Database }=await import('../dist-server/database.js');const target=new Database();
  const { migrate }=await import('../dist-server/migrate.js');
  const originalGet=ObjectStorage.prototype.get;
  ObjectStorage.prototype.get=async()=>Buffer.from('corrupt test download');
  let rolledBack=false;try{await migrate(sourcePath,target)}catch{rolledBack=true}finally{ObjectStorage.prototype.get=originalGet}
  check('bad Storage verification aborts migration',rolledBack);
  check('partial copy rolls back',Number((await db.query('SELECT COUNT(*) AS count FROM shop.users')).rows[0].count)===0);
  const migration=await migrate(sourcePath,target);check('migration row counts',migration.counts.users===1&&migration.counts.product_images===1);
  check('all tables included',Object.keys(migration.counts).length===42);
  check('source file unchanged',originalDigest===createHash('sha256').update(readFileSync(sourcePath)).digest('hex'));
  check('preserved password hash',(await db.query('SELECT password_hash FROM shop.users WHERE id=42')).rows[0].password_hash===passwordHash);
  check('preserved balance',Number((await db.query('SELECT balance_units FROM shop.reward_balances WHERE user_id=42')).rows[0].balance_units)===12345);
  const saved=(await target.prepare("SELECT image FROM product_images WHERE id='original'").get());check('migrated image bytes',saved.image.equals(png));
  const inserted=await target.prepare("INSERT INTO users (full_name,email,password_hash,role) VALUES ('Next','next@example.test',?,'customer')").run(passwordHash);check('identity sequence follows preserved IDs',inserted.lastInsertRowid===43);
  let rejected=false;try{await migrate(sourcePath,target)}catch{rejected=true}check('migration refuses populated target',rejected);
  await target.close();
 }finally{process.chdir(originalCwd);await db.close();db=liveDb;rmSync(temporary,{recursive:true,force:true})}
}finally{await new Promise(resolve=>httpServer.close(resolve));await db.close()}
console.log({checks,failures});process.exitCode=failures?1:0;
