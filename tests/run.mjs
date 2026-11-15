import { tableNames } from '../dist-server/schema.js';
import { testSellerVerification } from './seller-verification-flow.mjs';
import { testMarketing } from './marketing-flow.mjs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
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
Object.assign(process.env,{SELLER_VERIFICATION_WORKER:'disabled',SKIP_IMPORTED_CATALOG:'true',DATABASE_URL:'postgresql://test:test@localhost/test',PORT:'4311',NODE_ENV:'production',ADMIN_EMAIL:'admin@example.test',ADMIN_PASSWORD:'long-test-password-123',SMTP_HOST:'',SMTP_PORT:'',SMTP_USER:'',SMTP_PASSWORD:'',BREVO_API_KEY:'',EMAIL_FROM:'',SELLER_EMAIL_VERIFICATION:'auto'});
const { ObjectStorage } = await import('../dist-server/storage.js');
const realPut=ObjectStorage.prototype.put,realGet=ObjectStorage.prototype.get,realVerify=ObjectStorage.prototype.verifyBucket;
ObjectStorage.prototype.verifyBucket=async()=>{};
const objects=new Map();
ObjectStorage.prototype.put=async(bytes)=>{const key='images/'+createHash('sha256').update(bytes).digest('hex');objects.set(key,bytes);return key};
ObjectStorage.prototype.get=async(key)=>{if(!objects.has(key))throw new Error('Object missing');return objects.get(key)};
const verificationObjects=new Map();
ObjectStorage.prototype.putVerification=async(bytes,type)=>{const path='verification/'+randomUUID()+'.'+(type==='image/png'?'png':type==='image/jpeg'?'jpg':'webp');verificationObjects.set(path,bytes);return path};
ObjectStorage.prototype.getVerification=async(path)=>{if(!verificationObjects.has(path))throw new Error('Photo missing');return verificationObjects.get(path)};
ObjectStorage.prototype.deleteVerification=async(path)=>{verificationObjects.delete(path)};
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
 // Seller signup is usable before email setup without claiming email ownership.
 const verificationPhotos=Object.fromEntries(['selfie','id_front','id_back'].map(kind=>[kind,{type:'image/png',data:png.toString('base64')} ]));
 const sellerForm={verificationPhotos,verificationConsent:true,fullName:'New Seller',email:'new-seller@example.test',phone:'+15551234567',password:'new-seller-password-123',storeName:'New Shop',country:'Test',address:'Test',city:'Test',region:'Test',postalCode:'123'};
 r=await req('/api/auth/seller-verification-code',{method:'POST',body:JSON.stringify({email:sellerForm.email,fullName:sellerForm.fullName})});
 check('unconfigured email permits continuing signup',r.status===200&&r.data.verificationRequired===false&&!r.data.developmentCode,r);
 check('skipped email does not create a false verification record',(await db.query('SELECT * FROM shop.seller_email_verifications WHERE email=$1',[sellerForm.email])).rows.length===0);
 r=await req('/api/auth/register-seller',{method:'POST',body:JSON.stringify(sellerForm)});
 check('production seller signup creates a pending application without email setup',r.status===201&&r.data.user?.role==='customer'&&r.data.user?.sellerStatus==='pending'&&Boolean(r.cookie),r);
 r=await req('/api/auth/login',{method:'POST',body:JSON.stringify({email:sellerForm.email,password:sellerForm.password,loginType:'seller'})});check('pending applicant can log in to view application',r.status===200&&r.data.user?.sellerStatus==='pending',r);
 const newApplicantId=r.data.user.id;
 r=await req('/api/admin/seller-applications/'+newApplicantId+'/review',{method:'PATCH',body:JSON.stringify({status:'approved',revision:1,reviewed:true})},cookie);check('admin enables the new seller after reviewing photos',r.status===200&&r.data.user.role==='seller',r.status);
 r=await req('/api/auth/register-seller',{method:'POST',body:JSON.stringify({...sellerForm,email:'incomplete@example.test',storeName:''})});check('seller profile validation still applies',r.status===400,r);
 r=await req('/api/auth/register-seller',{method:'POST',body:JSON.stringify({...sellerForm,email:'invalid-email'})});check('seller email format validation still applies',r.status===400,r);
 r=await req('/api/auth/register-seller',{method:'POST',body:JSON.stringify(sellerForm)});check('duplicate seller rejected',r.status===409,r);
 process.env.SELLER_EMAIL_VERIFICATION='required';
 r=await req('/api/auth/register-seller',{method:'POST',body:JSON.stringify({...sellerForm,email:'required@example.test'})});check('required mode rejects unverified signup',r.status===400,r);
 r=await req('/api/auth/seller-verification-code',{method:'POST',body:JSON.stringify({email:'required@example.test'})});check('required mode never returns production code or bypass',r.status===503&&!r.data.developmentCode&&r.data.verificationRequired!==false,r);
 process.env.SELLER_EMAIL_VERIFICATION='auto';process.env.BREVO_API_KEY='test-only-placeholder';process.env.EMAIL_FROM='sender@example.test';
 const actualFetch=globalThis.fetch;let deliveredCode;
 try{
  globalThis.fetch=async(url,options)=>{
   if(String(url)==='https://api.brevo.com/v3/smtp/email'){
    const mail=JSON.parse(options.body);const code=mail.textContent.match(/verification code is (\d{6})/);if(code)deliveredCode=code[1];return new Response('{}',{status:201});
   }
   return actualFetch(url,options);
  };
  const verifiedForm={...sellerForm,email:'verified-seller@example.test'};
  r=await req('/api/auth/register-seller',{method:'POST',body:JSON.stringify(verifiedForm)});check('auto restores verification when email configured',r.status===400,r);
  r=await req('/api/auth/seller-verification-code',{method:'POST',body:JSON.stringify({email:verifiedForm.email,fullName:verifiedForm.fullName})});check('configured email sends code without exposing it',r.status===200&&r.data.sent===true&&!r.data.developmentCode&&/^\d{6}$/.test(deliveredCode||''),r);
  r=await req('/api/auth/verify-seller-email-code',{method:'POST',body:JSON.stringify({email:verifiedForm.email,code:deliveredCode})});check('delivered code verifies',r.status===200&&r.data.verified===true,r);
  r=await req('/api/auth/register-seller',{method:'POST',body:JSON.stringify(verifiedForm)});check('verified seller can register with email configured',r.status===201,r);
  // An outage in a configured provider must never downgrade verification to optional.
  globalThis.fetch=async(url,options)=>String(url)==='https://api.brevo.com/v3/smtp/email'?new Response('{}',{status:503}):actualFetch(url,options);
  r=await req('/api/auth/seller-verification-code',{method:'POST',body:JSON.stringify({email:'outage@example.test'})});check('provider outage does not bypass verification',r.status===503&&r.data.verificationRequired!==false&&!r.data.developmentCode,r);
 }finally{globalThis.fetch=actualFetch;process.env.BREVO_API_KEY='';process.env.EMAIL_FROM='';process.env.SELLER_EMAIL_VERIFICATION='auto'}
 // Logo uploads use the existing image API and private Storage, and failed uploads roll back signup.
 const logoForm={...sellerForm,email:'logo-seller@example.test',storeLogoUpload:{type:'image/png',data:png.toString('base64')}};
 r=await req('/api/auth/register-seller',{method:'POST',body:JSON.stringify(logoForm)});check('seller signup with uploaded logo',r.status===201,r);
 const logoSellerId=r.data.user?.id,logoCookie=r.cookie;
 if(logoSellerId)await req('/api/admin/seller-applications/'+logoSellerId+'/review',{method:'PATCH',body:JSON.stringify({status:'approved',revision:1,reviewed:true})},cookie);
 if(logoSellerId){
  r=await req('/api/seller/store',{},logoCookie);const logoUrl=r.data.store?.storeLogoUrl;
  check('uploaded logo has a stable public image URL',r.status===200&&/^\/api\/product-images\/[a-f0-9]{64}$/.test(logoUrl||''),r);
  if(logoUrl){const image=await fetch(base+logoUrl);check('logo image returns original bytes',image.ok&&Buffer.from(await image.arrayBuffer()).equals(png));}
  r=await req('/api/stores/'+logoSellerId);check('public store retains uploaded logo',r.status===200&&JSON.stringify(r.data).includes(logoUrl),r);
  r=await req('/api/seller/store',{method:'PUT',body:JSON.stringify({storeName:'Updated Logo Shop',storeDescription:'Updated',storeLogoUrl:logoUrl})},logoCookie);check('store edit preserves uploaded logo URL',r.status===200,r);
 }
 for(const [label,upload] of [['SVG',{type:'image/svg+xml',data:Buffer.from('<svg/>').toString('base64')}],['mismatched image',{type:'image/jpeg',data:png.toString('base64')}],['oversized image',{type:'image/png',data:Buffer.concat([png,Buffer.alloc(2*1024*1024)]).toString('base64')}]]){
  const email=label.split(' ')[0]+'-invalid@example.test';
  r=await req('/api/auth/register-seller',{method:'POST',body:JSON.stringify({...sellerForm,email,storeLogoUpload:upload})});check('reject '+label+' logo',r.status===400,r);
  check('invalid logo creates no account '+label,(await db.query('SELECT id FROM shop.users WHERE email=$1',[email])).rows.length===0);
 }
 const putBeforeFailure=ObjectStorage.prototype.put;
 try{
  ObjectStorage.prototype.put=async()=>{throw new Error('Simulated upload failure')};
  r=await req('/api/auth/register-seller',{method:'POST',body:JSON.stringify({...logoForm,email:'failed-logo@example.test'})});check('Storage failure reported',r.status===500,r);
  check('failed logo upload rolls back account',(await db.query("SELECT id FROM shop.users WHERE email='failed-logo@example.test'")).rows.length===0);
 }finally{ObjectStorage.prototype.put=putBeforeFailure}
 await testSellerVerification({req,check,cookie,seller,buyer,db,png,base,sellerForm,verificationObjects});
 // Create/edit warehouse images and galleries, then import without losing stable URLs.
 const jpeg=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,255,217]);
 const warehouseForm={name:'Uploaded warehouse item',category:'Bags',price:25,description:'Uploaded photos',imageUploads:{primary:{type:'image/png',data:png.toString('base64')},gallery:[{type:'image/jpeg',data:jpeg.toString('base64')}]}};
 r=await req('/api/admin/warehouse',{method:'POST',body:JSON.stringify(warehouseForm)},cookie);check('admin warehouse create with uploaded images',r.status===201,r);
 let warehouse=r.data.product;
 if(warehouse){
  check('warehouse main image appears first in gallery',warehouse.imageUrls.length===2&&warehouse.imageUrls[0]===warehouse.imageUrl,r);
  for(const [i,url] of warehouse.imageUrls.entries()){const image=await fetch(base+url);check('warehouse image '+i+' persists',image.ok&&Buffer.from(await image.arrayBuffer()).equals(i===0?png:jpeg));}
  r=await req('/api/seller/warehouse/'+warehouse.id+'/import',{method:'POST'},seller);check('warehouse import retains uploaded images',r.status===201&&r.data.product.imageUrl===warehouse.imageUrl&&r.data.product.imageUrls.length===2,r);
  r=await req('/api/admin/warehouse/'+warehouse.id,{method:'PUT',body:JSON.stringify({...warehouse,imageUploads:{primary:{type:'image/jpeg',data:jpeg.toString('base64')}}})},cookie);check('warehouse main image replacement',r.status===200,r);
  const replacement=r.data.product;
  check('replacement is first and old main removed from gallery',replacement?.imageUrl!==warehouse.imageUrl&&replacement?.imageUrls[0]===replacement?.imageUrl&&!replacement?.imageUrls.includes(warehouse.imageUrl),r);
  if(replacement)warehouse=replacement;
  r=await req('/api/admin/warehouse/'+warehouse.id,{method:'PUT',body:JSON.stringify({...warehouse,name:'Edited without replacing photos'})},cookie);check('warehouse edit preserves saved relative image URLs',r.status===200&&r.data.product.imageUrl===warehouse.imageUrl,r);
  const imageCount=Number((await db.query('SELECT COUNT(*) AS count FROM shop.product_images')).rows[0].count);
  const originalPut=ObjectStorage.prototype.put;
  try{
   ObjectStorage.prototype.put=async()=>{throw new Error('Simulated warehouse upload failure')};
   r=await req('/api/admin/warehouse/'+warehouse.id,{method:'PUT',body:JSON.stringify({...warehouse,name:'Should roll back',imageUploads:warehouseForm.imageUploads})},cookie);check('warehouse failed upload reported',r.status===500,r);
   const row=(await db.query('SELECT product_json FROM shop.warehouse_products WHERE id=$1',[warehouse.id])).rows[0];check('warehouse failed upload preserves existing item',JSON.parse(row.product_json).name==='Edited without replacing photos');
   check('warehouse failed upload leaves no image rows',Number((await db.query('SELECT COUNT(*) AS count FROM shop.product_images')).rows[0].count)===imageCount);
  }finally{ObjectStorage.prototype.put=originalPut}
 }
 await testMarketing({req,check,cookie,seller,buyer,db,png,base});
 // Picking a warehouse item supports review edits and keeps draft publication flags.
 r=await req('/api/admin/warehouse',{method:'POST',body:JSON.stringify({name:'Reviewable warehouse item',category:'Home',price:12,imageUrl:'https://example.test/warehouse.jpg',description:'Original'})},cookie);
 const selectedWarehouseId=r.data.product.id;
 r=await req('/api/seller/warehouse/'+selectedWarehouseId+'/import',{method:'POST',body:JSON.stringify({overrides:{name:'Reviewed warehouse item',price:14.5,isPublished:false,isStorePublished:true,imageUploads:{primary:{type:'image/png',data:png.toString('base64')}}}})},seller);
 check('warehouse picker import retains reviewed edits and draft status',r.status===201&&r.data.product.name==='Reviewed warehouse item'&&r.data.product.price===14.5&&r.data.product.category==='Home'&&r.data.product.isPublished===false,r.status);
 check('warehouse picker supports uploaded replacement image',r.data.product?.imageUrl?.startsWith('/api/product-images/'),r.status);
 // Warehouse navigation and full source data preservation.
 const sourceCatalogItem={name:'Imported '+ 'long product title '.repeat(9),category:'Catalog Test / Nested category',price:19.95,compareAtPrice:25,description:'Complete description '.repeat(150),imageUrl:'https://example.test/main.jpg',imageUrls:Array.from({length:10},(_,i)=>`https://example.test/gallery-${i}.jpg`),colors:Array.from({length:13},(_,i)=>`Color ${i}`),sizes:Array.from({length:13},(_,i)=>`Size ${i}`),rating:0,source:{host:'example.test',listingId:'original-listing'},sourceDetails:{skus:[{skuId:'test-sku',sellingPrice:20,attrs:[{attrName:'size',attrValueName:'Size 1'}]}],des:'<p>Original description</p>'}};
 const importedCatalogId=(await db.query('INSERT INTO shop.warehouse_products(product_json) VALUES ($1) RETURNING id',[JSON.stringify(sourceCatalogItem)])).rows[0].id;
 for(let i=0;i<26;i++)await db.query('INSERT INTO shop.warehouse_products(product_json) VALUES ($1)',[JSON.stringify({...sourceCatalogItem,name:`Catalog fixture ${i}`,source:undefined,sourceDetails:undefined})]);
 r=await req('/api/warehouse?category=Catalog%20Test',{},seller);
 check('warehouse paginates matching descendants',r.status===200&&r.data.total===27&&r.data.products.length===24&&r.data.categories.some(c=>c.category===sourceCatalogItem.category),r.status);
 check('warehouse lists omit large source variant payloads',r.data.products.every(p=>!p.sourceDetails));
 r=await req('/api/warehouse?category=Catalog%20Test&page=2',{},seller);check('warehouse second page contains remaining products',r.status===200&&r.data.products.length===3,r.status);
 r=await req('/api/warehouse?q=%25',{},seller);check('warehouse search treats wildcard text literally',r.status===200&&r.data.total===0,r.status);
 r=await req('/api/warehouse?category=Catalog',{},seller);check('warehouse category does not match partial parent name',r.status===200&&r.data.total===0,r.status);
 r=await req('/api/warehouse/'+importedCatalogId,{},seller);check('warehouse full details preserve source SKUs',r.status===200&&r.data.product.sourceDetails.skus[0].skuId==='test-sku',r.status);
 r=await req('/api/warehouse/'+importedCatalogId,{},buyer);check('warehouse full details require seller or admin',r.status===403,r.status);
 r=await req('/api/seller/warehouse/'+importedCatalogId+'/import',{method:'POST'},seller);
 check('source import retains full name, category, description, gallery, sizes and colors',r.status===201&&r.data.product.name===sourceCatalogItem.name.trim()&&r.data.product.category===sourceCatalogItem.category&&r.data.product.description===sourceCatalogItem.description.trim()&&r.data.product.imageUrls.length===11&&r.data.product.sizes.length===13&&r.data.product.colors.length===13,r.status);
 r=await req('/api/seller/warehouse/'+importedCatalogId+'/import',{method:'POST'},seller);check('source warehouse copy cannot be duplicated by one seller',r.status===409,r.status);
 r=await req('/api/admin/warehouse/'+importedCatalogId,{method:'PUT',body:JSON.stringify({...sourceCatalogItem,name:'Edited imported catalog item',sourceDetails:{skus:[]}})},cookie);check('admin can edit long imported catalog entries',r.status===200,r.status);
 r=await req('/api/warehouse/'+importedCatalogId,{},cookie);check('admin edit keeps original source metadata',r.status===200&&r.data.product.sourceDetails.skus[0].skuId==='test-sku'&&r.data.product.source.listingId==='original-listing',r.status);
 r=await req('/api/admin/warehouse',{method:'POST',body:JSON.stringify(warehouseForm)},seller);check('seller cannot upload into admin warehouse',r.status===403,r);
 r=await req('/api/admin/warehouse',{method:'POST',body:JSON.stringify({...warehouseForm,imageUploads:{primary:{type:'image/svg+xml',data:Buffer.from('<svg/>').toString('base64')}}})},cookie);check('warehouse rejects unsupported image types',r.status===400,r);
 if(product){
  r=await req('/api/seller/products/'+product.id,{method:'PATCH',body:JSON.stringify({...product,imageUploads:warehouseForm.imageUploads})},seller);check('seller edit accepts main and gallery uploads',r.status===200&&r.data.product.imageUrls.length===2&&r.data.product.imageUrls[0]===r.data.product.imageUrl,r);
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
  check('all tables included',Object.keys(migration.counts).length===tableNames.length&&tableNames.every(name=>Object.hasOwn(migration.counts,name)));
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
